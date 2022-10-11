/// <reference types="cypress" />
it('loads page', () => {
  cy.visit('/')
  cy.contains('Placeholder').should('be.visible')
})

it.skip('skips this test on purpose', () => {
  expect(false).to.be.true
})

it('has not test yet')
