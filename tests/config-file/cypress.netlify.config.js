const { defineConfig } = require("cypress");

module.exports = defineConfig({
  fixturesFolder: false,
  env: {
    CUSTOM_FILE: 42,
  },
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
