const { defineConfig } = require('cypress')

module.exports = defineConfig({
  fixturesFolder: false,
  projectId: 'ixroqc',
  e2e: {
    setupNodeEvents(on, config) {},
    supportFile: false,
    baseUrl: 'http://localhost:5000',
    specPattern: 'cypress/e2e/**/*.{js,jsx,ts,tsx}',
  },
})
