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
  return got(url, {
    retry: {
      limit: 30,
      calculateDelay({attemptCount, retryOptions, error, computedValue}) {
        debugVerbose(`attempt ${attemptCount} ${computedValue}ms ${error.message}`)

        if (computedValue > timeout) {
          debug('%s timed out', url)
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
