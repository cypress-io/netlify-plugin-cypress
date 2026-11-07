// @ts-check
const puppeteer = require('puppeteer')
const debug = require('debug')('netlify-plugin-cypress')
const LocalWebServer = require('local-web-server')
const fs = require('fs')
const { stripIndent } = require('common-tags')
const { ping } = require('./ping')
const { PLUGIN_NAME } = require('./constants')

const getBrowserPath = async () => {
  const browserFetcher = puppeteer.createBrowserFetcher()
  const revisions = await browserFetcher.localRevisions()
  debug('local Chromium revisions %o', revisions)
  if (revisions.length <= 0) {
    throw new Error('Could not find local browser')
  }
  const info = await browserFetcher.revisionInfo(revisions[0])
  debug('found Chromium %o', info)
  return info.executablePath
}

/**
 * Serves a local folder. Resolves with the server once it is listening,
 * and rejects if the server cannot start, for example with EADDRINUSE
 * when another process already uses the port.
 * @see https://github.com/lwsjs/local-web-server
 * @param {string} directory
 * @param {number} port
 * @param {boolean|'index.html'} spa
 * @returns {Promise<import('http').Server>}
 */
async function serveFolder(directory, port, spa) {
  if (typeof spa === 'boolean') {
    if (spa) {
      // spa parameter should be the name of the
      // fallback file in the directory to serve
      // typically it is "index.html"
      spa = 'index.html'
    } else {
      // do not use fallback mechanism for routing
      spa = undefined
    }
  }
  debug(
    'serving local folder %o from working directory %s',
    {
      directory,
      port,
      spa,
    },
    process.cwd(),
  )

  if (!fs.existsSync(directory)) {
    throw new Error(`Cannot find folder "${directory}" to serve`)
  }

  const server = LocalWebServer.create({
    // @ts-ignore
    directory,
    port,
    spa,
    // to debug use
    // DEBUG=koa-send
    staticExtensions: ['html'],
  }).server

  // The server reports a listen error with an "error" event after create()
  // has returned, so a try/catch around create() can never catch it.
  // Wait for the outcome so the caller can fail the build cleanly.
  await new Promise((resolve, reject) => {
    if (server.listening) {
      return resolve()
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    const onError = (err) => {
      server.removeListener('listening', onListening)
      if (err.code === 'EADDRINUSE') {
        err.message = stripIndent`
          ${err.message}
          Another process is already using port ${port}, so the plugin cannot serve "${directory}".
          If a "start" command runs in an earlier step, make sure that server stops before this step.
        `
      }
      reject(err)
    }
    server.once('listening', onListening)
    server.once('error', onError)
  })

  return server
}

// how long the start command gets to exit on its own after SIGTERM,
// before every process left in its group gets SIGKILL
const STOP_SERVER_GRACE_MS = 2000

/**
 * Sends a signal to the whole process group of a detached process.
 * The start command runs inside a shell and usually spawns more processes
 * (for example shell -> npm -> sh -> node), so signaling only the shell
 * would leave the actual server running and holding its port.
 * Falls back to signaling the single process if the group is not reachable.
 */
function killProcessGroup(serverProcess, signal) {
  const { pid } = serverProcess
  if (pid && process.platform !== 'win32') {
    try {
      // a negative pid targets every process in the group
      process.kill(-pid, signal)
      return
    } catch (err) {
      // ESRCH means the group already exited
      if (err.code === 'ESRCH') {
        return
      }
      debug('could not signal process group %d: %s', pid, err.message)
    }
  }
  serverProcess.kill(signal)
}

/**
 * Checks if any process in the group of a detached process still exists.
 * Exited processes that were not cleaned up yet (zombies) also count,
 * so this can report true for the whole grace period. That only delays
 * stopping, because SIGKILL follows the grace period either way.
 */
function processGroupExists(serverProcess) {
  const { pid } = serverProcess
  if (!pid || process.platform === 'win32') {
    return serverProcess.exitCode === null && !serverProcess.killed
  }
  try {
    // signal 0 only checks that the processes exist
    process.kill(-pid, 0)
    return true
  } catch (err) {
    // EPERM means the processes exist but we cannot signal them
    return err.code === 'EPERM'
  }
}

function startServerMaybe(run, options = {}) {
  const startCommand = options.start
  if (!startCommand) {
    debug('No start command found')
    return
  }

  const serverProcess = run.command(startCommand, {
    detached: true,
    shell: true,
  })

  // The process promise rejects when we stop the server with a signal.
  // That is expected, so only report errors from before we stopped it,
  // for example a typo in the start command that exits with code 127.
  let stopping = false
  Promise.resolve(serverProcess).catch((err) => {
    if (stopping) {
      debug('server process exited: %s', err && err.message)
      return
    }
    console.error('')
    console.error('The start command "%s" exited unexpectedly', startCommand)
    console.error(err && err.message)
    console.error('')
  })

  debug('detached the process and returning stop function')
  return async () => {
    stopping = true
    console.log('stopping server process opened with:', startCommand)
    killProcessGroup(serverProcess, 'SIGTERM')

    // give the server a moment to shut down cleanly
    const deadline = Date.now() + STOP_SERVER_GRACE_MS
    while (processGroupExists(serverProcess) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Then stop anything left, such as a server that ignores SIGTERM.
    // Zombies may still be counted here, and SIGKILL does not affect them.
    if (processGroupExists(serverProcess)) {
      debug('server process still running, sending SIGKILL')
      killProcessGroup(serverProcess, 'SIGKILL')
    }
  }
}

async function waitOnMaybe(buildUtils, options = {}) {
  const waitOnUrl = options['wait-on']
  if (!waitOnUrl) {
    debug('no wait-on defined')
    return
  }

  const waitOnTimeout = options['wait-on-timeout'] || '60'

  console.log(
    'waiting on "%s" with timeout of %s seconds',
    waitOnUrl,
    waitOnTimeout,
  )

  const waitTimeoutMs = parseFloat(waitOnTimeout) * 1000

  try {
    await ping(waitOnUrl, waitTimeoutMs)
    debug('url %s responds', waitOnUrl)
  } catch (err) {
    debug('pinging %s for %d ms failed', waitOnUrl, waitTimeoutMs)
    debug(err)
    return buildUtils.failBuild(
      `Pinging ${waitOnUrl} for ${waitTimeoutMs} failed`,
      { error: err },
    )
  }
}

const isValidBrowser = (name) => name === 'electron' || name === 'chromium'

async function runCypressTests(
  baseUrl,
  record,
  spec,
  group,
  tag,
  browser,
  configFile,
) {
  if (!isValidBrowser(browser)) {
    throw new Error(`Invalid browser name "${browser}"`)
  }

  // we will use Cypress via its NPM module API
  // https://on.cypress.io/module-api
  const cypress = require('cypress')

  let ciBuildId
  if (record) {
    // https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    // unique build id we can use to link preBuild and postBuild recordings
    ciBuildId = process.env.BUILD_ID
  }

  const browserPath =
    browser === 'electron' ? 'electron' : await getBrowserPath()

  debug('run cypress params %o', {
    baseUrl,
    record,
    spec,
    group,
    tag,
    ciBuildId,
    browser: browserPath,
  })

  return await cypress.run({
    config: {
      baseUrl,
    },
    spec,
    record,
    group,
    tag,
    ciBuildId,
    browser: browserPath,
    headless: true,
    configFile,
  })
}

/**
 * Reports the number of successful and failed tests.
 * If there are failed tests, uses the `errorCallback` to
 * fail the build step.
 * @param {*} results
 * @param {function} errorCallback
 * @param {function} summaryCallback
 */
const processCypressResults = (results, errorCallback, summaryCallback) => {
  if (typeof errorCallback !== 'function') {
    debug('Typeof of error callback %s', errorCallback)
    throw new Error(
      `Expected error callback to be a function, it was ${typeof errorCallback}`,
    )
  }
  if (typeof summaryCallback !== 'function') {
    debug('Typeof of summary callback %s', summaryCallback)
    throw new Error(
      `Expected summary callback to be a function, it was ${typeof summaryCallback}`,
    )
  }

  if (results.failures) {
    // Cypress failed without even running the tests
    console.error('Problem running Cypress')
    console.error(results.message)

    return errorCallback('Problem running Cypress', {
      error: new Error(results.message),
    })
  }

  debug('Cypress run results')
  Object.keys(results).forEach((key) => {
    if (key.startsWith('total')) {
      debug('%s:', key, results[key])
    }
  })

  // Note: text looks nice with double space after the emoji
  const summary = [
    'tests:',
    `✅  ${results.totalPassed}`,
    `🔥  ${results.totalFailed}`,
    `⭕️  ${results.totalPending}`,
    `🚫  ${results.totalSkipped}`,
  ]

  let text = stripIndent`
    ✅  Passed tests: ${results.totalPassed}
    🔥  Failed tests: ${results.totalFailed}
    ⭕️  Pending tests: ${results.totalPending}
    🚫  Skipped tests: ${results.totalSkipped}
  `
  if (results.runUrl) {
    summary.push(`🔗 [dashboard run](${results.runUrl})`)
    text += `\n🔗 Cypress Dashboard url: [${results.runUrl}](${results.runUrl})`
  }
  summaryCallback({
    title: PLUGIN_NAME,
    summary: summary.join(' '),
    text,
  })

  // results.totalFailed gives total number of failed tests
  if (results.totalFailed) {
    return errorCallback('Failed Cypress tests', {
      error: new Error(`${results.totalFailed} test(s) failed`),
    })
  }
}

const hasRecordKey = () => typeof process.env.CYPRESS_RECORD_KEY === 'string'

module.exports = {
  ping,
  getBrowserPath,
  serveFolder,
  startServerMaybe,
  runCypressTests,
  processCypressResults,
  hasRecordKey,
  waitOnMaybe,
}
