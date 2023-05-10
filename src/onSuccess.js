// @ts-check
const R = require('ramda')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')
const {
  runCypressTests,
  processCypressResults,
  hasRecordKey,
} = require('./utils')
const { DEFAULT_BROWSER } = require('./constants')

module.exports = async ({ utils, inputs, constants }) => {
  debugVerbose('onSuccess arg %o', { utils, inputs, constants })

  // extract test run parameters
  const onSuccessInputs = R.omit(['preBuild', 'postBuild'], inputs || {})
  debug('onSuccess inputs %o', onSuccessInputs)

  const isLocal = constants.IS_LOCAL
  const siteName = process.env.SITE_NAME
  const deployUrl = process.env[onSuccessInputs.deployUrlEnvVar]
  debug('onSuccess against %o', {
    siteName,
    deployUrl,
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

  if (!deployUrl) {
    return errorCallback('Missing deploy URL. Please set a valid Netlify environment variable as the deploy URL to set the baseUrl in your cypress configuration. For example, set deployUrlEnvVar to DEPLOY_PRIME_URL.\nSee https://docs.netlify.com/configure-builds/environment-variables/#deploy-urls-and-metadata for more details on which environment variables can be used.')
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

  const configFile = onSuccessInputs.configFile

  console.log('testing deployed url %s', deployUrl)
  const results = await runCypressTests(
    deployUrl,
    record,
    spec,
    group,
    tag,
    browser,
    configFile,
  )
  processCypressResults(results, errorCallback, summaryCallback)
}
