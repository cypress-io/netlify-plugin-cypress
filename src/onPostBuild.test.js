const onPostBuild = require('./onPostBuild.js')
const {
  startServerMaybe,
  serveFolder,
  runCypressTests,
  processCypressResults,
  waitOnMaybe,
} = require('./utils')

jest.mock('./utils')

const setup = ({ postBuildInputs = {} } = {}) => {
  const inputs = {
    postBuild: {
      spa: false,
      record: false,
      ...postBuildInputs,
    },
  }
  const constants = {
    PUBLISH_DIR: 'PUBLISH_DIR',
  }
  const utils = {
    run: jest.fn(),
    build: {
      failBuild: jest.fn(),
    },
    status: {
      show: jest.fn(),
    },
  }

  return {
    inputs,
    constants,
    utils,
    testFunction: () => onPostBuild({ inputs, constants, utils }),
  }
}

describe('onPostBuild', () => {
  beforeEach(() => {
    startServerMaybe.mockReset()
    serveFolder.mockReset()
    runCypressTests.mockReset()
    processCypressResults.mockReset()
  })

  it('skips when post build tests is disabled', async () => {
    const { testFunction } = setup({
      postBuildInputs: { enable: false },
    })

    await expect(testFunction()).resolves.toBe(undefined)
    expect(startServerMaybe).not.toHaveBeenCalled()
    expect(serveFolder).not.toHaveBeenCalled()
  })

  describe('start option', () => {
    it('runs the specified command', async () => {
      const startCommand = 'a start command'
      const { testFunction, utils } = setup({
        postBuildInputs: {
          enable: true,
          start: startCommand,
        },
      })

      await expect(testFunction()).resolves.toBe(undefined)
      expect(startServerMaybe).toHaveBeenCalledWith(utils.run, {
        start: startCommand,
      })
    })

    it('waits for the specified url before continuing', async () => {
      const startCommand = 'a start command'
      const { testFunction, utils, inputs } = setup({
        postBuildInputs: {
          enable: true,
          start: startCommand,
          'wait-on': 'URL',
          'wait-on-timeout': 10,
        },
      })

      await expect(testFunction()).resolves.toBe(undefined)
      expect(waitOnMaybe).toHaveBeenCalledWith(utils.build, {
        'wait-on': inputs.postBuild['wait-on'],
        'wait-on-timeout': inputs.postBuild['wait-on-timeout'],
      })
    })

    it('kills the process when tests are complete', async () => {
      const { testFunction } = setup({
        postBuildInputs: {
          enable: true,
          start: 'a start command',
        },
      })

      const stopMock = jest.fn()
      startServerMaybe.mockReturnValue(stopMock)

      await expect(testFunction()).resolves.toBe(undefined)
      expect(stopMock).toHaveBeenCalled()
    })

    it('does not try to serve the publish folder', async () => {
      const { testFunction } = setup({
        postBuildInputs: {
          enable: true,
          start: 'a start command',
        },
      })

      await expect(testFunction()).resolves.toBe(undefined)
      expect(serveFolder).not.toHaveBeenCalled()
    })

    it('runs the cypress tests', async () => {
      const { testFunction, inputs } = setup({
        postBuildInputs: {
          enable: true,
          start: 'a start command',
        },
      })

      await expect(testFunction()).resolves.toBe(undefined)
      // TODO: Improve this assertion
      expect(runCypressTests).toHaveBeenCalledWith(
        'http://localhost:8080',
        inputs.postBuild.record,
        inputs.postBuild.spec,
        undefined,
        undefined,
        'chromium',
        undefined,
      )
    })

    it('processes the cypress test results', async () => {
      const { testFunction, inputs, utils } = setup({
        postBuildInputs: {
          enable: true,
          start: 'a start command',
        },
      })

      const testResults = 'RESULTS'
      runCypressTests.mockReturnValue(testResults)

      await expect(testFunction()).resolves.toBe(undefined)
      // TODO: Improve assertion
      expect(processCypressResults).toHaveBeenCalledWith(
        testResults,
        expect.any(Function),
        expect.any(Function),
      )
    })
  })

  describe('serve folder', () => {
    it('serves the publish folder when a start command is not specified', async () => {
      const { testFunction, constants } = setup({
        postBuildInputs: {
          enable: true,
        },
      })

      await expect(testFunction()).resolves.toBe(undefined)
      expect(serveFolder).toHaveBeenCalledWith(
        constants.PUBLISH_DIR,
        8080,
        false,
      )
    })

    it('kills the process when tests are complete', async () => {
      const { testFunction } = setup({
        postBuildInputs: {
          enable: true,
        },
      })

      const serverCloseMock = jest.fn().mockImplementation((cb) => cb())
      serveFolder.mockReturnValue({ close: serverCloseMock })

      await expect(testFunction()).resolves.toBe(undefined)
      expect(serverCloseMock).toHaveBeenCalled()
    })

    it('calls the error callback when it fails to serve the folder', async () => {
      const { testFunction, utils, constants } = setup({
        postBuildInputs: {
          enable: true,
        },
      })

      const error = new Error('Broken')
      serveFolder.mockImplementation(() => {
        throw error
      })

      await expect(testFunction()).resolves.toBe(undefined)
      expect(
        utils.build.failBuild,
      ).toHaveBeenCalledWith(
        `Could not serve folder ${constants.PUBLISH_DIR}`,
        { error },
      )
    })

    it('rejects when it fails to close the server', async () => {
      const { testFunction, utils, constants } = setup({
        postBuildInputs: {
          enable: true,
        },
      })

      const error = new Error('Broken')
      serveFolder.mockReturnValue({
        close: () => {
          throw error
        },
      })

      await expect(testFunction()).rejects.toBe(error)
    })

    it('runs the cypress tests', async () => {
      const { testFunction, inputs } = setup({
        postBuildInputs: {
          enable: true,
        },
      })

      await expect(testFunction()).resolves.toBe(undefined)
      // TODO: Improve this assertion
      expect(runCypressTests).toHaveBeenCalledWith(
        'http://localhost:8080',
        inputs.postBuild.record,
        inputs.postBuild.spec,
        undefined,
        undefined,
        'chromium',
        undefined,
      )
    })

    it('processes the cypress test results', async () => {
      const { testFunction, inputs, utils } = setup({
        postBuildInputs: {
          enable: true,
          start: 'a start command',
        },
      })

      const testResults = 'RESULTS'
      runCypressTests.mockReturnValue(testResults)

      await expect(testFunction()).resolves.toBe(undefined)
      // TODO: Improve assertion
      expect(processCypressResults).toHaveBeenCalledWith(
        testResults,
        expect.any(Function),
        expect.any(Function),
      )
    })
  })
})
