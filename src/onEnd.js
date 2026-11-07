// @ts-check
const debug = require('debug')('netlify-plugin-cypress')
const { cleanUpChromeForTesting } = require('./browser')

module.exports = async ({ utils }) => {
  try {
    await cleanUpChromeForTesting(utils.cache)
  } catch (error) {
    // the tests already ran, so a cache problem shouldn't fail the build
    debug('could not clean up Chrome for Testing: %s', error.message)
    console.warn(
      `Could not update the Chrome for Testing cache: ${error.message}`,
    )
  }
}
