/// <reference types="cypress" />
describe('custom config file', () => {
  it('uses cypress.netlify.config.js', () => {
    // this property is set in the cypress.netlify.config.js file
    expect(Cypress.env()).to.have.property('CUSTOM_FILE', 42)
  })
})
