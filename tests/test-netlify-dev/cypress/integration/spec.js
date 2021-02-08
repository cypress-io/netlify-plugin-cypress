/// <reference types="cypress" />
it('loads page', () => {
  cy.visit('/')
  cy.contains('Placeholder').should('be.visible')
})

it('greets me', () => {
  cy.visit('/')
  cy.request('/api/hello')
    .its('body')
    .should('equal', 'Hello from a serverless function!')
})
