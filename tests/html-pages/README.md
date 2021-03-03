# HTML pages

See [#116](https://github.com/cypress-io/netlify-plugin-cypress/issues/116)

In this example the public folder has both `index.html` and pages like `public/commands/about.html` which we want to visit using `cy.visit('/commands/about')` without using `.html` extension

Test locally with

```
$ DEBUG=netlify-plugin-cypress ../../node_modules/.bin/netlify build
```

These tests run:
- [ ] before the build
- [x] after the build
- [ ] on deploy success
