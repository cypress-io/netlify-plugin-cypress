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
  resolveBuildId,
  uninstall,
} = require('@puppeteer/browsers')

// Pinned so a new Chrome release can't change test results between builds,
// and used whenever the version a user asks for can't be downloaded.
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

/**
 * @typedef {{ restore: Function, save: Function }} NetlifyCache
 *   Netlify's `utils.cache`
 */

/** @type {Map<string, Promise<string>>} */
const pathsByRequest = new Map()
// Every build step runs in the same process, and steps can ask for different
// versions. Only onEnd knows which ones the whole build used, so the cache
// is pruned and saved there.
const usedVersions = new Set()
// Restoring replaces the whole folder, which would delete a version an
// earlier step downloaded in this build.
let restoreAttempted = false
let downloaded = false

async function removeUnusedVersions() {
  const installed = await getInstalledBrowsers({ cacheDir: BROWSER_CACHE_DIR })
  const unused = installed.filter(
    (browser) => !usedVersions.has(browser.buildId),
  )
  for (const browser of unused) {
    debug('removing Chrome for Testing %s', browser.buildId)
    await uninstall({
      browser: browser.browser,
      buildId: browser.buildId,
      platform: browser.platform,
      cacheDir: BROWSER_CACHE_DIR,
    })
  }
  return unused.length
}

/**
 * @param {string} buildId
 * @param {NetlifyCache | undefined} cache
 * @param {*} platform
 */
async function installVersion(buildId, cache, platform) {
  usedVersions.add(buildId)
  const options = {
    browser: Browser.CHROME,
    buildId,
    cacheDir: BROWSER_CACHE_DIR,
    platform,
  }
  const executablePath = computeExecutablePath(options)

  if (fs.existsSync(executablePath)) {
    debug('found Chrome for Testing %s at %s', buildId, executablePath)
    return executablePath
  }

  if (cache && !restoreAttempted) {
    restoreAttempted = true
    if (await cache.restore(BROWSER_CACHE_DIR)) {
      if (fs.existsSync(executablePath)) {
        debug('restored Chrome for Testing %s from the Netlify cache', buildId)
        return executablePath
      }
      debug('the Netlify cache has a different Chrome for Testing version')
    }
  }

  console.log(`Downloading Chrome for Testing ${buildId}`)
  try {
    await install(options)
  } catch (error) {
    throw new Error(
      `Could not download Chrome for Testing ${buildId}: ${error.message}`,
    )
  }
  downloaded = true

  return executablePath
}

/**
 * @param {NetlifyCache | undefined} cache
 * @param {string | undefined} requestedVersion
 */
async function installChromeForTesting(cache, requestedVersion) {
  const platform = detectBrowserPlatform()
  if (!platform) {
    throw new Error(
      `Chrome for Testing is not available for ${os.platform()} ${os.arch()}`,
    )
  }

  if (requestedVersion) {
    try {
      const buildId = await resolveBuildId(
        Browser.CHROME,
        platform,
        requestedVersion,
      )
      debug('browserVersion "%s" resolved to %s', requestedVersion, buildId)
      const executablePath = await installVersion(buildId, cache, platform)
      console.log(`Using Chrome for Testing ${buildId}`)
      return executablePath
    } catch (error) {
      console.warn(
        `Could not use Chrome for Testing "${requestedVersion}": ${error.message}`,
      )
      console.warn(
        `Falling back to the plugin's pinned version, ${CHROME_FOR_TESTING_VERSION}`,
      )
    }
  }

  return installVersion(CHROME_FOR_TESTING_VERSION, cache, platform)
}

/**
 * Returns the path to Chrome for Testing, downloading it on first use.
 * Steps that ask for the same version share one download.
 * @param {NetlifyCache | undefined} cache
 * @param {string | number} [requestedVersion] a version, major version, or
 *   channel. A number comes from an unquoted major version in netlify.toml.
 *   Falls back to the pinned version if it can't be downloaded.
 * @returns {Promise<string>}
 */
function getChromeForTestingPath(cache, requestedVersion) {
  const version =
    requestedVersion === undefined || requestedVersion === null
      ? undefined
      : String(requestedVersion).trim() || undefined
  const key = version || CHROME_FOR_TESTING_VERSION
  if (!pathsByRequest.has(key)) {
    pathsByRequest.set(
      key,
      installChromeForTesting(cache, version).catch((error) => {
        pathsByRequest.delete(key)
        throw error
      }),
    )
  }
  return /** @type {Promise<string>} */ (pathsByRequest.get(key))
}

/**
 * Removes Chrome for Testing versions this build didn't use, then saves the
 * folder to the Netlify cache if anything changed. Runs once, after every
 * step that could need a browser.
 * @param {NetlifyCache | undefined} cache
 */
async function cleanUpChromeForTesting(cache) {
  if (usedVersions.size === 0) {
    debug('no step used Chrome for Testing, leaving the cache alone')
    return
  }
  const removed = await removeUnusedVersions()
  if (cache && (downloaded || removed > 0)) {
    await cache.save(BROWSER_CACHE_DIR)
    debug('saved Chrome for Testing to the Netlify cache')
  }
}

module.exports = {
  BROWSER_CACHE_DIR,
  CHROME_FOR_TESTING_VERSION,
  cleanUpChromeForTesting,
  getChromeForTestingPath,
}
