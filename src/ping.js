const got = require('got')
const debug = require('debug')('netlify-plugin-cypress')
const debugVerbose = require('debug')('netlify-plugin-cypress:verbose')

/**
 * A small utility for checking when an URL responds, kind of
 * a poor man's https://www.npmjs.com/package/wait-on. This version
 * is implemented using https://github.com/sindresorhus/got
 */
const ping = (url, timeout) => {
  if (!timeout) {
    throw new Error('Expected timeout in ms')
  }

  debug('pinging "%s" for %d ms max', url, timeout)

  // make copy of the error codes that "got" retries on
  const errorCodes = [...got.defaults.options.retry.errorCodes]
  errorCodes.push('ESOCKETTIMEDOUT')

  // we expect the server to respond within a time limit
  // and if it does not - retry up to total "timeout" duration
  const individualPingTimeout = Math.min(timeout, 30000)
  const limit = Math.ceil(timeout / individualPingTimeout)

  debug(`total ping timeout ${timeout}`)
  debug(`individual ping timeout ${individualPingTimeout}ms`)
  debug(`retries limit ${limit}`)

  const start = +new Date()
  return got(url, {
    headers: {
      Accept: 'text/html, application/json, text/plain, */*',
    },
    timeout: individualPingTimeout,
    errorCodes,
    retry: {
      limit,
      calculateDelay({ error, attemptCount }) {
        if (error) {
          debugVerbose(`got error ${JSON.stringify(error)}`)
        }
        const now = +new Date()
        const elapsed = now - start
        debugVerbose(
          `${elapsed}ms ${error.method} ${error.host} ${error.code} attempt ${attemptCount}`,
        )
        if (elapsed > timeout) {
          console.error(
            '%s timed out on retry %d of %d',
            url,
            attemptCount,
            limit,
          )
          return 0
        }

        // if the error code is ECONNREFUSED use shorter timeout
        // because the server is probably starting
        if (error.code === 'ECONNREFUSED') {
          return 1000
        }

        // default "long" timeout
        return individualPingTimeout
      },
    },
  }).then(() => {
    const now = +new Date()
    const elapsed = now - start
    debug(`pinging ${url} has finished ok after ${elapsed}ms`)
  })
}

module.exports = { ping }
