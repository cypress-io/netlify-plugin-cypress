// @ts-check
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')
const {
  startServerMaybe,
  serveFolder,
  runCypressTests,
  processCypressResults,
  hasRecordKey,
  waitOnMaybe,
} = require('./utils')
const { DEFAULT_BROWSER } = require('./constants')

async function postBuild({
  utils,
  fullPublishFolder,
  record,
  spec,
  start,
  waitOn,
  waitOnTimeout,
  group,
  tag,
  spa,
  browser,
  configFile,
  errorCallback,
  summaryCallback,
}) {
  const port = 8080
  let server
  let closeServer

  if (start) {
    closeServer = startServerMaybe(utils.run, { start })
    await waitOnMaybe(utils.build, {
      'wait-on': waitOn,
      'wait-on-timeout': waitOnTimeout,
    })
  } else {
    try {
      server = serveFolder(fullPublishFolder, port, spa)
      debug('local server listening on port %d', port)
    } catch (err) {
      return errorCallback(`Could not serve folder ${fullPublishFolder}`, {
        error: err,
      })
    }
  }

  const baseUrl = waitOn || `http://localhost:${port}`

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
    await closeServer()
  }

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          return reject(err)
        }
        debug('closed local server on port %d', port)
        resolve()
      })
    })
  }
  // ===============================================

  processCypressResults(results, errorCallback, summaryCallback)
}

module.exports = async ({ inputs, constants, utils }) => {
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
  const record = Boolean(postBuildInputs.record) && hasRecordKey()

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
  const configFile = postBuildInputs.configFile

  const errorCallback = utils.build.failBuild.bind(utils.build)
  const summaryCallback = utils.status.show.bind(utils.status)

  await postBuild({
    utils,
    fullPublishFolder,
    record,
    spec: postBuildInputs.spec,
    start: postBuildInputs.start,
    waitOn: postBuildInputs['wait-on'],
    waitOnTimeout: postBuildInputs['wait-on-timeout'],
    group,
    tag,
    spa,
    browser,
    configFile,
    errorCallback,
    summaryCallback,
  })
}
