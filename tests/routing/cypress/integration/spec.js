/// <reference types="cypress" />
describe('Client-side routing', () => {
  it('goes from page to page', () => {
    cy.visit('/')

    // navigate to About page by clicking link
    cy.contains('a', 'About').click()
    // equivalent checks
    cy.url().should('match', /\/about$/)
    cy.location('pathname').should('equal', '/about')
    cy.contains('h2', 'About').should('be.visible')

    // navigate to Users page by clicking link
    cy.contains('a', 'Users').click()
    cy.url().should('match', /\/users$/)
    cy.location('pathname').should('equal', '/users')
    cy.contains('h2', 'Users').should('be.visible')

    // back to Home page
    cy.contains('a', 'Home').click()
    cy.location('pathname').should('equal', '/')
  })

  it('can visit directly the About page', () => {
    // the server redirects all unknown paths back to "/"
    // where the client-side routing correctly sends it
    cy.visit('/about')
    cy.url().should('match', /\/about$/)
    cy.location('pathname').should('equal', '/about')
    cy.contains('h2', 'About').should('be.visible')
  })

  it('can visit directly the Users page', () => {
    // the server redirects all unknown paths back to "/"
    // where the client-side routing correctly sends it
    cy.visit('/users')
    cy.url().should('match', /\/users$/)
    cy.location('pathname').should('equal', '/users')
    cy.contains('h2', 'Users').should('be.visible')
  })
})

