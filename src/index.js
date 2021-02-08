// @ts-check
const LocalWebServer = require('local-web-server')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')
const { ping, getBrowserPath } = require('./utils')
const fs = require('fs')

function serveFolder(directory, port, spa) {
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

  return LocalWebServer.create({
    // @ts-ignore
    directory,
    port,
    spa,
  }).server
}

function startServerMaybe(run, options = {}) {
  const startCommand = options.start
  if (!startCommand) {
    debug('No start command found')
    return
  }

  const serverProcess = run(startCommand, {
    detached: true,
    shell: true,
  })

  debug('detached the process and returning stop function')
  return () => {
    console.log('stopping server process opened with:', startCommand)
    serverProcess.kill()
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

async function runCypressTests(baseUrl, record, spec, group, tag) {
  // we will use Cypress via its NPM module API
  // https://on.cypress.io/module-api
  const cypress = require('cypress')

  let ciBuildId
  if (record) {
    // https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    // unique build id we can use to link preBuild and postBuild recordings
    ciBuildId = process.env.BUILD_ID
  }

  debug('run cypress params %o', {
    baseUrl,
    record,
    spec,
    group,
    tag,
    ciBuildId,
  })

  const browserPath = await getBrowserPath()
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
  })
}

async function install(arg) {
  debug('installing Cypress binary just in case')
  const runOptions = debug.enabled ? {} : { stdio: 'ignore' }
  try {
    await arg.utils.run('cypress', ['install'], runOptions)
  } catch (error) {
    debug('error installing Cypress: %s', error.message)
    const buildUtils = arg.utils.build
    console.error('')
    console.error('Failed to install Cypress')
    console.error('Did you forget to add Cypress as a dev dependency?')
    console.error('  npm i -D cypress')
    console.error('or')
    console.error(' yarn add -D cypress')
    console.error('')
    console.error(
      'See https://github.com/cypress-io/netlify-plugin-cypress#readme',
    )
    console.error('')
    buildUtils.failBuild(
      'Failed to install Cypress. Did you forget to add Cypress as a dev dependency?',
      { error },
    )
  }
}

async function cypressVerify(arg) {
  debug('verifying Cypress can run')
  try {
    await arg.utils.run('cypress', ['verify'])
  } catch (error) {
    debug('error verifying Cypress: %s', error.message)
    const buildUtils = arg.utils.build
    console.error('')
    console.error('Failed to verify Cypress')
    console.error('')
    buildUtils.failBuild('Failed to verify Cypress', { error })
  }
}

async function cypressInfo(arg) {
  debug('Cypress info')
  try {
    await arg.utils.run('cypress', ['info'])
  } catch (error) {
    debug('error in Cypress info command: %s', error.message)
    const buildUtils = arg.utils.build
    console.error('')
    console.error('Failed to run Cypress info')
    console.error('')
    buildUtils.failBuild('Failed Cypress info', { error })
  }
}

const processCypressResults = (results, errorCallback) => {
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

  // results.totalFailed gives total number of failed tests
  if (results.totalFailed) {
    return errorCallback('Failed Cypress tests', {
      error: new Error(`${results.totalFailed} test(s) failed`),
    })
  }
}

async function postBuild({
  fullPublishFolder,
  record,
  spec,
  group,
  tag,
  spa,
  errorCallback,
}) {
  const port = 8080
  let server

  try {
    server = serveFolder(fullPublishFolder, port, spa)
    debug('local server listening on port %d', port)
  } catch (err) {
    return errorCallback(`Could not serve folder ${fullPublishFolder}`, {
      error: err,
    })
  }

  const baseUrl = `http://localhost:${port}`

  const results = await runCypressTests(baseUrl, record, spec, group, tag)

  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        return reject(err)
      }
      debug('closed local server on port %d', port)
      resolve()
    })
  })

  processCypressResults(results, errorCallback)
}

const hasRecordKey = () => typeof process.env.CYPRESS_RECORD_KEY === 'string'

module.exports = {
  onPreBuild: async (arg) => {
    await install(arg)
    await cypressVerify(arg)
    await cypressInfo(arg)

    debug('cypress plugin preBuild inputs %o', arg.inputs)
    const preBuildInputs = arg.inputs && arg.inputs.preBuild
    if (!preBuildInputs) {
      debug('there are no preBuild inputs')
      return
    }

    const closeServer = startServerMaybe(arg.utils.run, preBuildInputs)
    await waitOnMaybe(arg.utils.build, preBuildInputs)

    const baseUrl = preBuildInputs['wait-on']
    const record = hasRecordKey() && Boolean(preBuildInputs.record)
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

    processCypressResults(results, arg.utils.build)
  },

  onPostBuild: async (arg) => {
    debugVerbose('postBuild arg %o', arg)
    debug('cypress plugin postBuild inputs %o', arg.inputs)

    const skipTests = Boolean(arg.inputs.skip)
    if (skipTests) {
      console.log('Skipping tests because skip=true')
      return
    }

    const fullPublishFolder = arg.constants.PUBLISH_DIR
    debug('folder to publish is "%s"', fullPublishFolder)

    // only if the user wants to record the tests and has set the record key
    // then we should attempt recording
    const record = hasRecordKey() && Boolean(arg.inputs.record)

    const spec = arg.inputs.spec
    let group
    let tag
    if (record) {
      group = arg.inputs.group || 'postBuild'

      if (arg.inputs.tag) {
        tag = arg.inputs.tag
      } else {
        tag = process.env.CONTEXT
      }
    }
    const spa = arg.inputs.spa

    const errorCallback = arg.utils.build.failBuild.bind(arg.utils.build)

    await postBuild({
      fullPublishFolder,
      record,
      spec,
      group,
      tag,
      spa,
      errorCallback,
    })
  },

  onSuccess: async (arg) => {
    debugVerbose('onSuccess arg %o', arg)

    const { utils, inputs, constants } = arg
    debug('onSuccess inputs %o', inputs)

    const isLocal = constants.IS_LOCAL
    const siteName = process.env.SITE_NAME
    const deployPrimeUrl = process.env.DEPLOY_PRIME_URL
    debug('onSuccess against %o', {
      siteName,
      deployPrimeUrl,
      isLocal,
    })

    // extract test run parameters
    const onSuccessInputs = inputs.onSuccess
    if (!onSuccessInputs) {
      debug('no onSuccess inputs, skipping testing the deployed url')
      return
    }

    const enableTests = Boolean(onSuccessInputs.enable)
    if (!enableTests) {
      console.log('Skipping tests because enable=false')
      return
    }

    debug('onSuccessInputs %s %o', typeof onSuccessInputs, onSuccessInputs)

    const errorCallback = utils.build.failPlugin.bind(utils.build)

    if (!deployPrimeUrl) {
      return errorCallback('Missing DEPLOY_PRIME_URL')
    }

    // only if the user wants to record the tests and has set the record key
    // then we should attempt recording
    const hasKey = hasRecordKey()
    const record = hasKey && Boolean(onSuccessInputs.record)

    const spec = onSuccessInputs.spec
    let group
    let tag
    if (record) {
      group = onSuccessInputs.group || 'onSuccess'

      if (onSuccessInputs.tag) {
        tag = onSuccessInputs.tag
      } else {
        tag = process.env.CONTEXT
      }
    }
    debug('deployed url test parameters %o', {
      hasRecordKey: hasKey,
      record,
      spec,
      group,
      tag,
    })

    console.log('testing deployed url %s', deployPrimeUrl)
    const results = await runCypressTests(
      deployPrimeUrl,
      record,
      spec,
      group,
      tag,
    )
    processCypressResults(results, errorCallback)
  },
}
