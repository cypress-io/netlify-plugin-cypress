// @ts-check
const fs = require('fs')
const os = require('os')
const path = require('path')
const debug = require('debug')('netlify-plugin-cypress')
const {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  uninstall,
} = require('@puppeteer/browsers')

// Pinned so a new Chrome release can't change test results between builds.
// Match the Chrome version in the latest Puppeteer release when bumping it.
const CHROME_FOR_TESTING_VERSION = '156.0.8078.47'

// Netlify doesn't keep the home folder between builds, so the plugin saves
// this folder with Netlify's build cache utilities. It stays outside the
// repository so it can never end up in a deploy.
const BROWSER_CACHE_DIR = path.join(
  os.homedir(),
  '.cache',
  'netlify-plugin-cypress',
)

/** @type {Promise<string> | undefined} */
let chromeForTestingPath

async function removeOtherVersions(cacheDir) {
  const installed = await getInstalledBrowsers({ cacheDir })
  const stale = installed.filter(
    (browser) => browser.buildId !== CHROME_FOR_TESTING_VERSION,
  )
  for (const browser of stale) {
    debug('removing Chrome for Testing %s', browser.buildId)
    await uninstall({
      browser: browser.browser,
      buildId: browser.buildId,
      platform: browser.platform,
      cacheDir,
    })
  }
}

/**
 * @param {{ restore: Function, save: Function } | undefined} cache
 *   Netlify's `utils.cache`
 */
async function installChromeForTesting(cache) {
  const platform = detectBrowserPlatform()
  if (!platform) {
    throw new Error(
      `Chrome for Testing is not available for ${os.platform()} ${os.arch()}`,
    )
  }

  const options = {
    browser: Browser.CHROME,
    buildId: CHROME_FOR_TESTING_VERSION,
    cacheDir: BROWSER_CACHE_DIR,
    platform,
  }
  const executablePath = computeExecutablePath(options)

  if (fs.existsSync(executablePath)) {
    debug('found Chrome for Testing at %s', executablePath)
    return executablePath
  }

  if (cache && (await cache.restore(BROWSER_CACHE_DIR))) {
    if (fs.existsSync(executablePath)) {
      debug('restored Chrome for Testing from the Netlify cache')
      return executablePath
    }
    debug('the Netlify cache has a different Chrome for Testing version')
  }

  console.log(`Downloading Chrome for Testing ${CHROME_FOR_TESTING_VERSION}`)
  try {
    await install(options)
  } catch (error) {
    throw new Error(
      `Could not download Chrome for Testing ${CHROME_FOR_TESTING_VERSION}: ${error.message}`,
    )
  }
  await removeOtherVersions(BROWSER_CACHE_DIR)

  if (cache) {
    await cache.save(BROWSER_CACHE_DIR)
    debug('saved Chrome for Testing to the Netlify cache')
  }

  return executablePath
}

/**
 * Returns the path to Chrome for Testing, downloading it on first use.
 * Every build step shares one download.
 * @param {{ restore: Function, save: Function } | undefined} cache
 *   Netlify's `utils.cache`
 * @returns {Promise<string>}
 */
function getChromeForTestingPath(cache) {
  if (!chromeForTestingPath) {
    chromeForTestingPath = installChromeForTesting(cache).catch((error) => {
      chromeForTestingPath = undefined
      throw error
    })
  }
  return chromeForTestingPath
}

module.exports = {
  BROWSER_CACHE_DIR,
  CHROME_FOR_TESTING_VERSION,
  getChromeForTestingPath,
}
