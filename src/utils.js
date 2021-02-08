// @ts-check
const puppeteer = require('puppeteer')
const got = require('got')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')

/**
 * A small utility for checking when an URL responds, kind of
 * a poor man's https://www.npmjs.com/package/wait-on
 */
const ping = (url, timeout) => {
  debug('pinging "%s" for %d ms max', url, timeout)
  const start = +new Date()

  return got(url, {
    retry: {
      limit: 30,
      calculateDelay({attemptCount, retryOptions, error}) {
        const now = +new Date()
        const elapsed = now - start
        debugVerbose(`attempt ${attemptCount} ${elapsed}ms ${error.message}`)

        if (elapsed > timeout) {
          debug('%s timed out after %dms, timeout was %dms',
            url, elapsed, timeout)
          console.error('%s timed out after %dms, timeout was %dms',
            url, elapsed, timeout)
          return 0
        }
        return 1000
      }
    }
  })
}

const getBrowserPath = async () => {
  const browserFetcher = puppeteer.createBrowserFetcher()
  const revisions = await browserFetcher.localRevisions()
  if (revisions.length <= 0) {
    throw new Error('Could not find local browser')
  }
  const info = await browserFetcher.revisionInfo(revisions[0])
  return info.executablePath
}


module.exports = {
  ping,
  getBrowserPath
}
