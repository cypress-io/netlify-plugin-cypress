const fs = require('fs')

// Jest 24 can't load the real module, which imports "node:" built-ins
jest.mock('@puppeteer/browsers', () => ({
  Browser: { CHROME: 'chrome' },
  computeExecutablePath: jest.fn(),
  detectBrowserPlatform: jest.fn(),
  getInstalledBrowsers: jest.fn(),
  install: jest.fn(),
  resolveBuildId: jest.fn(),
  uninstall: jest.fn(),
}))

const executableFor = (buildId) =>
  `/cache/chrome/linux-${buildId}/chrome-linux64/chrome`

const makeCache = (restored = false) => ({
  restore: jest.fn().mockResolvedValue(restored),
  save: jest.fn().mockResolvedValue(true),
})

describe('getChromeForTestingPath', () => {
  // build IDs whose executable is "on disk"
  let onDisk
  let browsers
  let getChromeForTestingPath
  let cleanUpChromeForTesting
  let BROWSER_CACHE_DIR
  let PINNED
  let warn
  let log

  beforeEach(() => {
    // browser.js remembers downloads for the whole build, so each test
    // loads a fresh copy of it
    jest.resetModules()
    browsers = require('@puppeteer/browsers')
    ;({
      getChromeForTestingPath,
      cleanUpChromeForTesting,
      BROWSER_CACHE_DIR,
      CHROME_FOR_TESTING_VERSION: PINNED,
    } = require('./browser'))

    onDisk = new Set()
    browsers.detectBrowserPlatform.mockReturnValue('linux')
    browsers.computeExecutablePath.mockImplementation(({ buildId }) =>
      executableFor(buildId),
    )
    // exact versions pass through, like the real resolveBuildId
    browsers.resolveBuildId.mockImplementation(async (b, p, tag) => tag)
    browsers.getInstalledBrowsers.mockImplementation(async () =>
      [...onDisk].map((buildId) => ({
        browser: 'chrome',
        buildId,
        platform: 'linux',
      })),
    )
    browsers.install.mockImplementation(async ({ buildId }) => {
      onDisk.add(buildId)
    })
    browsers.uninstall.mockImplementation(async ({ buildId }) => {
      onDisk.delete(buildId)
    })
    jest
      .spyOn(fs, 'existsSync')
      .mockImplementation((p) =>
        [...onDisk].some((buildId) => p === executableFor(buildId)),
      )
    log = jest.spyOn(console, 'log').mockImplementation(() => {})
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('pinned version', () => {
    it('uses a browser that is already on disk', async () => {
      onDisk.add(PINNED)
      const cache = makeCache()

      await expect(getChromeForTestingPath(cache)).resolves.toBe(
        executableFor(PINNED),
      )
      expect(cache.restore).not.toHaveBeenCalled()
      expect(browsers.install).not.toHaveBeenCalled()
    })

    it('restores the browser from the Netlify cache', async () => {
      const cache = makeCache()
      cache.restore.mockImplementation(async () => {
        onDisk.add(PINNED)
        return true
      })

      await expect(getChromeForTestingPath(cache)).resolves.toBe(
        executableFor(PINNED),
      )
      expect(cache.restore).toHaveBeenCalledWith(BROWSER_CACHE_DIR)
      expect(browsers.install).not.toHaveBeenCalled()

      await cleanUpChromeForTesting(cache)
      expect(cache.save).not.toHaveBeenCalled()
    })

    it('downloads the pinned version and saves it to the Netlify cache at the end', async () => {
      const cache = makeCache()

      await expect(getChromeForTestingPath(cache)).resolves.toBe(
        executableFor(PINNED),
      )
      expect(browsers.resolveBuildId).not.toHaveBeenCalled()
      expect(browsers.install).toHaveBeenCalledWith({
        browser: 'chrome',
        buildId: PINNED,
        cacheDir: BROWSER_CACHE_DIR,
        platform: 'linux',
      })
      expect(cache.save).not.toHaveBeenCalled()

      await cleanUpChromeForTesting(cache)
      expect(cache.save).toHaveBeenCalledTimes(1)
      expect(cache.save).toHaveBeenCalledWith(BROWSER_CACHE_DIR)
    })

    it('removes versions this build did not use at the end', async () => {
      const cache = makeCache()
      cache.restore.mockImplementation(async () => {
        onDisk.add('1.0.0')
        return true
      })

      await getChromeForTestingPath(cache)
      expect(browsers.uninstall).not.toHaveBeenCalled()

      await cleanUpChromeForTesting(cache)
      expect(cache.save).toHaveBeenCalledWith(BROWSER_CACHE_DIR)
      expect(browsers.uninstall).toHaveBeenCalledTimes(1)
      expect(browsers.uninstall).toHaveBeenCalledWith({
        browser: 'chrome',
        buildId: '1.0.0',
        platform: 'linux',
        cacheDir: BROWSER_CACHE_DIR,
      })
      expect([...onDisk]).toEqual([PINNED])
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
        `Could not download Chrome for Testing ${PINNED}: getaddrinfo ENOTFOUND`,
      )
      await expect(getChromeForTestingPath(makeCache())).resolves.toBe(
        executableFor(PINNED),
      )
    })

    it('works without the Netlify cache', async () => {
      await expect(getChromeForTestingPath(undefined)).resolves.toBe(
        executableFor(PINNED),
      )
    })

    it('fails on a platform without Chrome for Testing builds', async () => {
      browsers.detectBrowserPlatform.mockReturnValue(undefined)

      await expect(getChromeForTestingPath(makeCache())).rejects.toThrow(
        'Chrome for Testing is not available for',
      )
    })
  })

  describe('browserVersion', () => {
    it('downloads an exact version', async () => {
      await expect(
        getChromeForTestingPath(makeCache(), '150.0.7871.24'),
      ).resolves.toBe(executableFor('150.0.7871.24'))
      expect(browsers.install).toHaveBeenCalledTimes(1)
      expect(browsers.install).toHaveBeenCalledWith(
        expect.objectContaining({ buildId: '150.0.7871.24' }),
      )
      expect(log).toHaveBeenCalledWith('Using Chrome for Testing 150.0.7871.24')
      expect(warn).not.toHaveBeenCalled()
    })

    it('resolves a channel to a version', async () => {
      browsers.resolveBuildId.mockResolvedValue('157.0.1000.5')

      await expect(getChromeForTestingPath(makeCache(), 'beta')).resolves.toBe(
        executableFor('157.0.1000.5'),
      )
      expect(browsers.resolveBuildId).toHaveBeenCalledWith(
        'chrome',
        'linux',
        'beta',
      )
    })

    it('accepts an unquoted major version from netlify.toml', async () => {
      browsers.resolveBuildId.mockResolvedValue('150.0.7871.24')

      await getChromeForTestingPath(makeCache(), 150)
      expect(browsers.resolveBuildId).toHaveBeenCalledWith(
        'chrome',
        'linux',
        '150',
      )
    })

    it('uses the pinned version for a blank value', async () => {
      await expect(getChromeForTestingPath(makeCache(), '  ')).resolves.toBe(
        executableFor(PINNED),
      )
      expect(browsers.resolveBuildId).not.toHaveBeenCalled()
    })

    it('falls back to the pinned version when the version cannot be resolved', async () => {
      browsers.resolveBuildId.mockRejectedValue(new Error('ENOTFOUND'))

      await expect(getChromeForTestingPath(makeCache(), 'beta')).resolves.toBe(
        executableFor(PINNED),
      )
      expect(warn).toHaveBeenCalledWith(
        'Could not use Chrome for Testing "beta": ENOTFOUND',
      )
      expect(warn).toHaveBeenCalledWith(
        `Falling back to the plugin's pinned version, ${PINNED}`,
      )
      expect(browsers.install).toHaveBeenCalledTimes(1)
      expect(browsers.install).toHaveBeenCalledWith(
        expect.objectContaining({ buildId: PINNED }),
      )
    })

    it('falls back to the pinned version when the download fails', async () => {
      browsers.install.mockImplementation(async ({ buildId }) => {
        if (buildId === 'not-a-version') {
          throw new Error('404 Not Found')
        }
        onDisk.add(buildId)
      })

      await expect(
        getChromeForTestingPath(makeCache(), 'not-a-version'),
      ).resolves.toBe(executableFor(PINNED))
      expect(warn).toHaveBeenCalledWith(
        'Could not use Chrome for Testing "not-a-version": Could not download Chrome for Testing not-a-version: 404 Not Found',
      )
    })

    it('still fails when the pinned fallback cannot download either', async () => {
      browsers.install.mockRejectedValue(new Error('offline'))

      await expect(
        getChromeForTestingPath(makeCache(), '150.0.7871.24'),
      ).rejects.toThrow(`Could not download Chrome for Testing ${PINNED}`)
    })

    it('keeps every version the build used and restores the cache once', async () => {
      const cache = makeCache()

      await getChromeForTestingPath(cache, '150.0.7871.24')
      await getChromeForTestingPath(cache)
      await cleanUpChromeForTesting(cache)
      expect(browsers.install).toHaveBeenCalledTimes(2)
      expect(cache.restore).toHaveBeenCalledTimes(1)
      expect(browsers.uninstall).not.toHaveBeenCalled()
      expect([...onDisk].sort()).toEqual([PINNED, '150.0.7871.24'].sort())
    })

    it('keeps a restored version that a later step needs', async () => {
      // The cache holds only the pinned version. An earlier step downloads
      // a requested version, then a later step uses the pinned one.
      const cache = makeCache()
      cache.restore.mockImplementation(async () => {
        onDisk.add(PINNED)
        return true
      })

      await getChromeForTestingPath(cache, '150.0.7871.24')
      await expect(getChromeForTestingPath(cache)).resolves.toBe(
        executableFor(PINNED),
      )
      expect(browsers.install).toHaveBeenCalledTimes(1)
      expect(browsers.install).toHaveBeenCalledWith(
        expect.objectContaining({ buildId: '150.0.7871.24' }),
      )

      await cleanUpChromeForTesting(cache)
      expect(browsers.uninstall).not.toHaveBeenCalled()
      expect(cache.save).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanUpChromeForTesting', () => {
    it('leaves the cache alone when no step used Chrome for Testing', async () => {
      const cache = makeCache()

      await cleanUpChromeForTesting(cache)
      expect(browsers.getInstalledBrowsers).not.toHaveBeenCalled()
      expect(cache.save).not.toHaveBeenCalled()
    })

    it('works without the Netlify cache', async () => {
      await getChromeForTestingPath(undefined)
      await expect(cleanUpChromeForTesting(undefined)).resolves.toBe(undefined)
    })
  })
})
