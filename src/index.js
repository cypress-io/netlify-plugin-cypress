// @ts-check
const ecstatic = require('ecstatic')
const http = require('http')
const execa = require('execa')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')
const la = require('lazy-ass')
const is = require('check-more-types')
const { ping } = require('./utils')

function serveFolder (folder, port) {
  const server = ecstatic({
    root: folder
  })
  return http.createServer(server).listen(port)
}

function startServerMaybe (options = {}) {
  const startCommand = options.start
  if (!startCommand) {
    debug('No start command found')
    return
  }

  const serverProcess = execa(startCommand, {
    stdio: 'inherit',
    detached: true,
    shell: true
  })

  debug('detached the process and returning stop function')
  return () => {
    console.log('stopping server process opened with:', startCommand)
    serverProcess.kill()
  }
}

async function waitOnMaybe (options = {}) {
  const waitOnUrl = options['wait-on']
  if (!waitOnUrl) {
    debug('no wait-on defined')
    return
  }

  const waitOnTimeout = options['wait-on-timeout'] || '60'

  console.log(
    'waiting on "%s" with timeout of %s seconds',
    waitOnUrl,
    waitOnTimeout
  )

  const waitTimeoutMs = parseFloat(waitOnTimeout) * 1000

  try {
    await ping(waitOnUrl, waitTimeoutMs)
    debug('url %s responds', waitOnUrl)
  } catch (err) {
    debug('pinging %s for %d ms failed', waitOnUrl, waitTimeoutMs)
    debug(err)
    throw new Error(err.message)
  }
}

async function runCypressTests (baseUrl, record, spec, group, tag) {
  // we will use Cypress via its NPM module API
  // https://on.cypress.io/module-api
  const cypress = require('cypress')

  let ciBuildId
  if (record) {
    // https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    // unique build id we can use to link preBuild and postBuild recordings
    ciBuildId = process.env.BUILD_ID
  }

  debug('run cypress params %o', { baseUrl, record, spec, group, tag, ciBuildId })

  return await cypress.run({
    config: {
      baseUrl,
    },
    spec,
    record,
    group,
    // ignoring the TS error for now
    // https://github.com/cypress-io/cypress/pull/6796
    // @ts-ignore
    tag,
    ciBuildId
  })
}

async function onInit() {
  debug('installing Cypress binary just in case')
  if (debug.enabled) {
    await execa('npx', ['cypress', 'install'], {stdio: 'inherit'})
  } else {
    await execa('npx', ['cypress', 'install'])
  }
}

const processCypressResults = (results, failBuild) => {
  if (results.failures) {
    // Cypress failed without even running the tests
    console.error('Problem running Cypress')
    console.error(results.message)

    return failBuild('Problem running Cypress', {
      error: new Error(results.message)
    })
  }

  debug('Cypress run results')
  Object.keys(results).forEach(key => {
    if (key.startsWith('total')) {
      debug('%s:', key, results[key])
    }
  })

  // results.totalFailed gives total number of failed tests
  if (results.totalFailed) {
    return failBuild('Failed Cypress tests', {
      error: new Error(`${results.totalFailed} test(s) failed`)
    })
  }
}

async function postBuild({ fullPublishFolder, record, spec, group, tag, failBuild }) {
  const port = 8080
  const server = serveFolder(fullPublishFolder, port)
  debug('local server listening on port %d', port)

  const baseUrl = `http://localhost:${port}`

  const results = await runCypressTests(baseUrl, record, spec, group, tag)

  await new Promise((resolve, reject) => {
    server.close(err => {
      if (err) {
        return reject(err)
      }
      debug('closed local server on port %d', port)
      resolve()
    })
  })

  processCypressResults(results, failBuild)
}

const hasRecordKey = () => typeof process.env.CYPRESS_RECORD_KEY === 'string'

module.exports = function cypressPlugin (pluginConfig) {
  debugVerbose('cypressPlugin config %o', pluginConfig)

  // here we can grab all input settings to isolate Cypress logic
  // from reading the inputs

  return {
    name: 'cypress netlify plugin',
    onInit,
    preBuild: async (arg) => {
      debug('cypress plugin preBuild inputs %o', arg.inputs)
      const preBuildInputs = arg.inputs && arg.inputs.preBuild
      if (!preBuildInputs) {
        debug('there are no preBuild inputs')
        return
      }

      const closeServer = startServerMaybe(preBuildInputs)
      await waitOnMaybe(preBuildInputs)

      const baseUrl = preBuildInputs['wait-on']
      const record = Boolean(preBuildInputs.record)
      const spec = preBuildInputs.spec
      let group
      let tag
      if (record) {
        group = preBuildInputs.group || 'preBuild'
        if (preBuildInputs.tag) {
          tag = preBuildInputs.tag
        } else {
          tag = process.env.CONTEXT
        }
      }

      const results = await runCypressTests(baseUrl, record, spec, group, tag)

      if (closeServer) {
        debug('closing server')
        closeServer()
      }

      const failBuild = arg.utils && arg.utils.build && arg.utils.build.failBuild
      la(is.fn(failBuild), 'expected failBuild function inside', arg.utils)

      processCypressResults(results, failBuild)
    },

    postBuild: async (arg) => {
      debugVerbose('postBuild arg %o', arg)
      debug('cypress plugin postBuild inputs %o', arg.inputs)

      const fullPublishFolder = arg.netlifyConfig.build.publish
      debug('folder to publish is "%s"', fullPublishFolder)

      // only if the user wants to record the tests and has set the record key
      // then we should attempt recording
      const record = hasRecordKey() && Boolean(pluginConfig.record)

      const spec = pluginConfig.spec
      let group
      let tag
      if (record) {
        group = pluginConfig.group || 'postBuild'
        if (pluginConfig.tag) {
          tag = pluginConfig.tag
        }
      }

      const failBuild = arg.utils && arg.utils.build && arg.utils.build.failBuild
      la(is.fn(failBuild), 'expected failBuild function inside', arg.utils)

      return postBuild({
        fullPublishFolder,
        record,
        spec,
        group,
        tag,
        failBuild
      })
    }
  }
}
