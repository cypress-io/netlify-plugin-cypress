// @ts-check
const debug = require('debug')('netlify-plugin-cypress')
const {
  ping,
  startServerMaybe,
  runCypressTests,
  processCypressResults,
  hasRecordKey,
  waitOnMaybe,
} = require('./utils')
const { DEFAULT_BROWSER } = require('./constants')

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

module.exports = async (arg) => {
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

  const configFile = preBuildInputs.configFile

  const results = await runCypressTests(
    baseUrl,
    record,
    spec,
    group,
    tag,
    browser,
    configFile,
  )

  if (closeServer) {
    debug('closing server')
    closeServer()
  }

  const errorCallback = utils.build.failBuild.bind(utils.build)
  const summaryCallback = utils.status.show.bind(utils.status)

  processCypressResults(results, errorCallback, summaryCallback)
}
