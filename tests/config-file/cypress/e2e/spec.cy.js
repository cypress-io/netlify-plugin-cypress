/// <reference types="cypress" />
describe('custom config file', () => {
  it('uses cypress.netlify.json', () => {
    // this property is set in the cypress.netlify.json file
    expect(Cypress.env()).to.have.property('CUSTOM_FILE', 42)
  })
})
