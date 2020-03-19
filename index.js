// @ts-check
const ecstatic = require('ecstatic')
const http = require('http')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')

function serveFolder (folder, port) {
  const server = ecstatic({
    root: folder
  })
  return http.createServer(server).listen(port)
}

async function runCypressTests (baseUrl, record, spec) {
  // we will use Cypress via its NPM module API
  // https://on.cypress.io/module-api
  const cypress = require('cypress')

  console.log('running Cypress against url %s recording?', baseUrl, record)

  return await cypress.run({
    config: {
      baseUrl,
    },
    spec,
    record
  })
}

async function postBuild({ fullPublishFolder, record, spec, failBuild }) {
  const port = 8080
  const server = serveFolder(fullPublishFolder, port)
  debug('local server listening on port %d', port)

  const baseUrl = `http://localhost:${port}`

  const results = await runCypressTests(baseUrl, record, spec)

  await new Promise((resolve, reject) => {
    server.close(err => {
      if (err) {
        return reject(err)
      }
      debug('closed local server on port %d', port)
      resolve()
    })
  })

  // seems Cypress TS definition does not have "failures" and "message" properties
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

module.exports = function cypressPlugin (pluginConfig) {
  debugVerbose('cypressPlugin config %o', pluginConfig)

  return {
    name: 'cypress netlify plugin',
    postBuild: async (arg) => {
      debugVerbose('postBuild arg %o', arg)

      const fullPublishFolder = arg.netlifyConfig.build.publish
      debug('folder to publish is "%s"', fullPublishFolder)

      // only if the user wants to record the tests and has set the record key
      // then we should attempt recording
      const record =
        typeof process.env.CYPRESS_RECORD_KEY === 'string' &&
        Boolean(pluginConfig.record)

      const spec = pluginConfig.spec

      const exitWithError = (message, info) => {
        console.error('Exit with error: %s', message)
        throw info.error
      }
      const failBuild = arg.utils && arg.utils.build && arg.utils.build.failBuild || exitWithError

      return postBuild({
        fullPublishFolder,
        record,
        spec,
        failBuild
      })
    }
  }
}
