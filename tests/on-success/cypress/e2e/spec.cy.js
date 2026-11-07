/// <reference types="cypress" />
describe('onSuccess', () => {
  it('visits the "deployed" site', () => {
    // baseUrl is set by the plugin from DEPLOY_PRIME_URL
    cy.visit('/')
    cy.contains('h1', 'On success')
  })

  // the next two tests check that skipped and pending tests
  // show up in the plugin's summary and do not fail the run
  it.skip('skips this test on purpose', () => {
    expect(false).to.be.true
  })

  it('has no test yet')
})
