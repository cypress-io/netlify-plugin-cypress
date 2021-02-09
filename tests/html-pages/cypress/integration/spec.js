/// <reference types="cypress" />
describe('html-pages', () => {
  it('loads the index page', () => {
    cy.visit('/')
    cy.contains('Index page')
  })

  it('loads the about page', () => {
    cy.visit('/commands/about')
    cy.contains('About')
  })
})
