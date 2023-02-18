/// <reference types="cypress" />
it('loads page', () => {
  cy.visit('/')
  cy.contains('Placeholder').should('be.visible')
})
