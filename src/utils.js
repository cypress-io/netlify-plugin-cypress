// @ts-check
const puppeteer = require('puppeteer')
const debug = require('debug')('netlify-plugin-cypress')
const LocalWebServer = require('local-web-server')
const fs = require('fs')
const { ping } = require('./ping')

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
 * Servers local folder
 * @see https://github.com/lwsjs/local-web-server
 * @param {string} directory
 * @param {number} port
 * @param {boolean|'index.html'} spa
 */
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
    // to debug use
    // DEBUG=koa-send
    staticExtensions: ['html'],
  }).server
}

module.exports = {
  ping,
  getBrowserPath,
  serveFolder,
}
