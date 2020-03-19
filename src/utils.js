// @ts-check
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
      retries(retry, error) {
        const now = +new Date()
        debugVerbose(
          `${now - start}ms ${error.method} ${error.host} ${
            error.code
          }`
        )
        if (now - start > timeout) {
          console.error('%s timed out', url)
          return 0
        }
        return 1000
      }
    }
  })
}

module.exports = {
  ping
}
