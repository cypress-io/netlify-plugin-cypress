// @ts-check
const { stripIndent } = require('common-tags')
const R = require('ramda')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')
const { ping, getBrowserPath, serveFolder } = require('./utils')

const PLUGIN_NAME = 'netlify-plugin-cypress'
const DEFAULT_BROWSER = 'electron'

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

const isValidBrowser = (name) => name === 'electron' || name === 'chromium'

async function runCypressTests(baseUrl, record, spec, group, tag, browser) {
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

async function postBuild({
  fullPublishFolder,
  record,
  spec,
  group,
  tag,
  spa,
  browser,
  errorCallback,
  summaryCallback,
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

  const results = await runCypressTests(
    baseUrl,
    record,
    spec,
    group,
    tag,
    browser,
  )

  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        return reject(err)
      }
      debug('closed local server on port %d', port)
      resolve()
    })
  })

  processCypressResults(results, errorCallback, summaryCallback)
}

const hasRecordKey = () => typeof process.env.CYPRESS_RECORD_KEY === 'string'

module.exports = {
  onPreBuild: async (arg) => {
    // we need to install everything to be ready
    await install(arg)
    await cypressVerify(arg)
    await cypressInfo(arg)

    const { inputs, utils } = arg

    const preBuildInputs = inputs.preBuild || {}
    debug('preBuild inputs %o', preBuildInputs)

    const enablePreBuildTests = Boolean(preBuildInputs.enable)
    if (!enablePreBuildTests) {
      debug('Skipping preBuild tests')
      return
    }

    const browser = preBuildInputs.browser || DEFAULT_BROWSER

    const closeServer = startServerMaybe(utils.run, preBuildInputs)
    await waitOnMaybe(utils.build, preBuildInputs)

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

    const results = await runCypressTests(
      baseUrl,
      record,
      spec,
      group,
      tag,
      browser,
    )

    if (closeServer) {
      debug('closing server')
      closeServer()
    }

    const errorCallback = utils.build.failBuild.bind(utils.build)
    const summaryCallback = utils.status.show.bind(utils.status)

    processCypressResults(results, errorCallback, summaryCallback)
  },

  onPostBuild: async ({ inputs, constants, utils }) => {
    debugVerbose('===postBuild===')

    const postBuildInputs = inputs.postBuild || {}
    debug('cypress plugin postBuild inputs %o', postBuildInputs)

    const enablePostBuildTests = Boolean(postBuildInputs.enable)
    if (!enablePostBuildTests) {
      debug('Skipping postBuild tests')
      return
    }

    const fullPublishFolder = constants.PUBLISH_DIR
    debug('folder to publish is "%s"', fullPublishFolder)

    const browser = postBuildInputs.browser || DEFAULT_BROWSER

    // only if the user wants to record the tests and has set the record key
    // then we should attempt recording
    const record = hasRecordKey() && Boolean(postBuildInputs.record)

    const spec = postBuildInputs.spec
    let group
    let tag
    if (record) {
      group = postBuildInputs.group || 'postBuild'

      if (postBuildInputs.tag) {
        tag = postBuildInputs.tag
      } else {
        tag = process.env.CONTEXT
      }
    }
    const spa = postBuildInputs.spa

    const errorCallback = utils.build.failBuild.bind(utils.build)
    const summaryCallback = utils.status.show.bind(utils.status)

    await postBuild({
      fullPublishFolder,
      record,
      spec,
      group,
      tag,
      spa,
      browser,
      errorCallback,
      summaryCallback,
    })
  },

  /**
   * Executes after successful Netlify deployment.
   * @param {any} arg
   */
  onSuccess: async ({ utils, inputs, constants }) => {
    debugVerbose('onSuccess arg %o', { utils, inputs, constants })

    // extract test run parameters
    const onSuccessInputs = R.omit(['preBuild', 'postBuild'], inputs || {})
    debug('onSuccess inputs %o', onSuccessInputs)

    const isLocal = constants.IS_LOCAL
    const siteName = process.env.SITE_NAME
    const deployPrimeUrl = process.env.DEPLOY_PRIME_URL
    debug('onSuccess against %o', {
      siteName,
      deployPrimeUrl,
      isLocal,
    })

    const enableOnSuccessTests = Boolean(onSuccessInputs.enable)
    if (!enableOnSuccessTests) {
      debug('Skipping onSuccess tests')
      return
    }

    debug('onSuccessInputs %s %o', typeof onSuccessInputs, onSuccessInputs)

    const errorCallback = utils.build.failPlugin.bind(utils.build)
    const summaryCallback = utils.status.show.bind(utils.status)

    if (!deployPrimeUrl) {
      return errorCallback('Missing DEPLOY_PRIME_URL')
    }

    const browser = onSuccessInputs.browser || DEFAULT_BROWSER

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
      browser,
    )
    processCypressResults(results, errorCallback, summaryCallback)
  },
}
