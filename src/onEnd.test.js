const onEnd = require('./onEnd')
const { cleanUpChromeForTesting } = require('./browser')

jest.mock('./browser', () => ({ cleanUpChromeForTesting: jest.fn() }))

describe('onEnd', () => {
  beforeEach(() => {
    cleanUpChromeForTesting.mockReset()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('cleans up Chrome for Testing with the Netlify cache', async () => {
    const cache = { restore: jest.fn(), save: jest.fn() }

    await onEnd({ utils: { cache } })
    expect(cleanUpChromeForTesting).toHaveBeenCalledWith(cache)
  })

  it('warns instead of failing when the cleanup fails', async () => {
    cleanUpChromeForTesting.mockRejectedValue(new Error('disk full'))

    await expect(onEnd({ utils: { cache: {} } })).resolves.toBe(undefined)
    expect(console.warn).toHaveBeenCalledWith(
      'Could not update the Chrome for Testing cache: disk full',
    )
  })
})
