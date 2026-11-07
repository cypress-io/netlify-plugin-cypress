const fs = require('fs')

// Jest 24 can't load the real module, which imports "node:" built-ins
jest.mock('@puppeteer/browsers', () => ({
  Browser: { CHROME: 'chrome' },
  computeExecutablePath: jest.fn(),
  detectBrowserPlatform: jest.fn(),
  getInstalledBrowsers: jest.fn(),
  install: jest.fn(),
  uninstall: jest.fn(),
}))

const EXECUTABLE = '/cache/chrome/linux-156.0.8078.47/chrome-linux64/chrome'

const makeCache = (restored = false) => ({
  restore: jest.fn().mockResolvedValue(restored),
  save: jest.fn().mockResolvedValue(true),
})

describe('getChromeForTestingPath', () => {
  let exists
  let browsers
  let getChromeForTestingPath
  let BROWSER_CACHE_DIR
  let CHROME_FOR_TESTING_VERSION

  beforeEach(() => {
    // browser.js remembers the download for the whole build, so each test
    // loads a fresh copy of it
    jest.resetModules()
    browsers = require('@puppeteer/browsers')
    ;({
      getChromeForTestingPath,
      BROWSER_CACHE_DIR,
      CHROME_FOR_TESTING_VERSION,
    } = require('./browser'))

    exists = false
    browsers.detectBrowserPlatform.mockReturnValue('linux')
    browsers.computeExecutablePath.mockReturnValue(EXECUTABLE)
    browsers.getInstalledBrowsers.mockResolvedValue([])
    browsers.install.mockImplementation(async () => {
      exists = true
    })
    jest.spyOn(fs, 'existsSync').mockImplementation(() => exists)
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses a browser that is already on disk', async () => {
    exists = true
    const cache = makeCache()

    await expect(getChromeForTestingPath(cache)).resolves.toBe(EXECUTABLE)
    expect(cache.restore).not.toHaveBeenCalled()
    expect(browsers.install).not.toHaveBeenCalled()
  })

  it('restores the browser from the Netlify cache', async () => {
    const cache = makeCache()
    cache.restore.mockImplementation(async () => {
      exists = true
      return true
    })

    await expect(getChromeForTestingPath(cache)).resolves.toBe(EXECUTABLE)
    expect(cache.restore).toHaveBeenCalledWith(BROWSER_CACHE_DIR)
    expect(browsers.install).not.toHaveBeenCalled()
    expect(cache.save).not.toHaveBeenCalled()
  })

  it('downloads the pinned version and saves it to the Netlify cache', async () => {
    const cache = makeCache()

    await expect(getChromeForTestingPath(cache)).resolves.toBe(EXECUTABLE)
    expect(browsers.install).toHaveBeenCalledWith({
      browser: 'chrome',
      buildId: CHROME_FOR_TESTING_VERSION,
      cacheDir: BROWSER_CACHE_DIR,
      platform: 'linux',
    })
    expect(cache.save).toHaveBeenCalledWith(BROWSER_CACHE_DIR)
  })

  it('downloads again when the cache holds a different version', async () => {
    const cache = makeCache(true)
    browsers.getInstalledBrowsers.mockResolvedValue([
      { browser: 'chrome', buildId: '1.0.0', platform: 'linux' },
      {
        browser: 'chrome',
        buildId: CHROME_FOR_TESTING_VERSION,
        platform: 'linux',
      },
    ])

    await expect(getChromeForTestingPath(cache)).resolves.toBe(EXECUTABLE)
    expect(browsers.install).toHaveBeenCalled()
    expect(browsers.uninstall).toHaveBeenCalledTimes(1)
    expect(browsers.uninstall).toHaveBeenCalledWith({
      browser: 'chrome',
      buildId: '1.0.0',
      platform: 'linux',
      cacheDir: BROWSER_CACHE_DIR,
    })
    expect(cache.save).toHaveBeenCalledWith(BROWSER_CACHE_DIR)
  })

  it('downloads once when several steps ask for the browser', async () => {
    const cache = makeCache()

    await Promise.all([
      getChromeForTestingPath(cache),
      getChromeForTestingPath(cache),
    ])
    await getChromeForTestingPath(cache)
    expect(browsers.install).toHaveBeenCalledTimes(1)
  })

  it('names the version when the download fails, and retries next time', async () => {
    browsers.install.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))

    await expect(getChromeForTestingPath(makeCache())).rejects.toThrow(
      `Could not download Chrome for Testing ${CHROME_FOR_TESTING_VERSION}: getaddrinfo ENOTFOUND`,
    )
    await expect(getChromeForTestingPath(makeCache())).resolves.toBe(EXECUTABLE)
  })

  it('works without the Netlify cache', async () => {
    await expect(getChromeForTestingPath(undefined)).resolves.toBe(EXECUTABLE)
  })

  it('fails on a platform without Chrome for Testing builds', async () => {
    browsers.detectBrowserPlatform.mockReturnValue(undefined)

    await expect(getChromeForTestingPath(makeCache())).rejects.toThrow(
      'Chrome for Testing is not available for',
    )
  })
})
