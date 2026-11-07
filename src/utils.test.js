/**
 * @jest-environment node
 */
const net = require('net')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { serveFolder, startServerMaybe } = require('./utils')

// Reserves a free port by listening on port 0, then releases it.
const getFreePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })

const listen = (port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(port, () => resolve(server))
  })

const close = (server) => new Promise((resolve) => server.close(resolve))

const isPortFree = async (port) => {
  try {
    await close(await listen(port))
    return true
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      return false
    }
    throw err
  }
}

// Polls until the port is free (or in use), and returns whether it got there
const waitForPort = async (port, free, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while ((await isPortFree(port)) !== free) {
    if (Date.now() >= deadline) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return true
}

const waitForPortInUse = async (port) => {
  if (!(await waitForPort(port, false, 10000))) {
    throw new Error(`Nothing started listening on port ${port}`)
  }
}

// After SIGKILL, the kernel can take a moment to release the port
const waitForPortFree = (port) => waitForPort(port, true, 1000)

// local-web-server loads its middleware with dynamic requires that Jest's
// module loader cannot resolve, so these tests start the real server
// through serve-cli.js in a separate Node process.
const serveCli = (folder, port) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'serve-cli.js'),
      folder,
      String(port),
    ])
    let output = ''
    const onData = (data) => {
      output += data
      if (output.includes('listening at')) {
        child.kill()
      }
    }
    // If the CLI stalls, stop it before the test times out, so it cannot
    // keep running and keep Jest from exiting.
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })

describe('serveFolder', () => {
  it('starts listening on a free port', async () => {
    const port = await getFreePort()
    const { output } = await serveCli(os.tmpdir(), port)

    expect(output).toContain(`listening at http://localhost:${port}`)
  }, 20000)

  it('fails with a clear EADDRINUSE error when the port is taken', async () => {
    const port = await getFreePort()
    const blocker = await listen(port)

    try {
      const { code, output } = await serveCli(os.tmpdir(), port)

      expect(code).toBe(1)
      expect(output).toContain('EADDRINUSE')
      expect(output).toContain(`Another process is already using port ${port}`)
      expect(output).not.toContain('listening at')
    } finally {
      await close(blocker)
    }
  }, 20000)

  it('rejects when the folder does not exist', async () => {
    const port = await getFreePort()

    await expect(serveFolder('./does-not-exist', port, false)).rejects.toThrow(
      'Cannot find folder "./does-not-exist" to serve',
    )
  })
})

describe('startServerMaybe', () => {
  let children = []

  // Same signature as the "utils.run.command" helper Netlify gives plugins.
  // Like the execa child process it returns, the child is also a promise
  // that rejects when the command fails or is killed by a signal.
  const run = {
    command: (command, options) => {
      const child = spawn(command, { ...options, stdio: 'ignore' })
      const done = new Promise((resolve, reject) => {
        child.on('exit', (code, signal) => {
          if (code === 0) {
            return resolve()
          }
          reject(new Error(`Command failed: ${command} (${signal || code})`))
        })
      })
      children.push(child)
      return Object.assign(child, {
        then: done.then.bind(done),
        catch: done.catch.bind(done),
      })
    },
  }

  afterEach(() => {
    // If a test fails, its servers may still be running. Force kill them
    // so the test fails fast instead of keeping Jest from exiting.
    children.forEach((child) => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (err) {
        // already exited
      }
    })
    children = []
    jest.restoreAllMocks()
  })

  it('returns nothing without a start command', () => {
    expect(startServerMaybe(run, {})).toBe(undefined)
  })

  if (process.platform !== 'win32') {
    it('reports a start command that exits on its own', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      startServerMaybe(run, { start: 'exit 3' })
      await new Promise((resolve) => children[0].on('exit', resolve))
      // let the rejection handler run
      await new Promise((resolve) => setImmediate(resolve))

      expect(consoleError).toHaveBeenCalledWith(
        'The start command "%s" exited unexpectedly',
        'exit 3',
      )
    })

    it('does not report an error when the plugin stops the server', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const stop = startServerMaybe(run, { start: 'sleep 30' })
      await stop()
      await new Promise((resolve) => setImmediate(resolve))

      expect(consoleError).not.toHaveBeenCalled()
    })

    it('stops nested server processes and frees their port', async () => {
      const port = await getFreePort()
      // Mimics "npm run serve": the shell starts another shell, which
      // starts the node process that actually holds the port.
      const server = `require('net').createServer().listen(${port})`
      const start = `sh -c "node -e \\"${server}\\""`

      const stop = startServerMaybe(run, { start })
      await waitForPortInUse(port)

      await stop()

      expect(await waitForPortFree(port)).toBe(true)
    }, 20000)

    it('stops a server that ignores SIGTERM', async () => {
      const port = await getFreePort()
      const server = `process.on('SIGTERM', () => {}); require('net').createServer().listen(${port})`
      const start = `sh -c "node -e \\"${server}\\""`

      const stop = startServerMaybe(run, { start })
      await waitForPortInUse(port)

      await stop()

      expect(await waitForPortFree(port)).toBe(true)
    }, 20000)

    it('stops within the grace period when zombies are left', async () => {
      // "sleep" never cleans up its finished child, so after the group is
      // stopped, the short sleep stays behind as a zombie. Inside a
      // container whose init process is slow to clean up zombies, the group
      // keeps looking alive, so stopping must not wait longer than the
      // grace period.
      const stop = startServerMaybe(run, {
        start: 'sleep 0.2 & exec sleep 30',
      })
      await new Promise((resolve) => setTimeout(resolve, 500))

      const started = Date.now()
      await stop()

      expect(Date.now() - started).toBeLessThan(3000)
    }, 20000)
  }
})
