/// <reference types="cypress" />
it('loads page', () => {
  if (Cypress.config('baseUrl')) {
    cy.visit('/')
  } else {
    cy.visit('public/index.html')
  }
  cy.contains('Placeholder').should('be.visible')
})
