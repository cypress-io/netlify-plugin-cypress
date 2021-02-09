/// <reference types="cypress" />
describe('html-pages', () => {
  it('loads the index page', () => {
    cy.visit('/')
  })

  it('loads the about page', () => {
    cy.visit('/commands/about')
  })
})
