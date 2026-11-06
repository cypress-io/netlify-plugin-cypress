/// <reference types="cypress" />
describe('onSuccess', () => {
  it('visits the "deployed" site', () => {
    // baseUrl is set by the plugin from DEPLOY_PRIME_URL
    cy.visit('/')
    cy.contains('h1', 'On success')
  })
})
