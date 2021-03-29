# netlify-plugin-cypress
[![CircleCI](https://circleci.com/gh/cypress-io/netlify-plugin-cypress/tree/master.svg?style=svg&circle-token=9cbb587a5a0ae4ce28b011dd03d10d66de906708)](https://circleci.com/gh/cypress-io/netlify-plugin-cypress/tree/master) [![renovate-app badge][renovate-badge]][renovate-app] [![netlify-plugin-cypress](https://img.shields.io/endpoint?url=https://dashboard.cypress.io/badge/simple/ixroqc/master&style=flat&logo=cypress)](https://dashboard.cypress.io/projects/ixroqc/runs) [![Netlify Status](https://api.netlify.com/api/v1/badges/76892baf-2ad8-4642-b283-f2135963ff51/deploy-status)](https://app.netlify.com/sites/sad-lumiere-6a00a5/deploys)
> Runs Cypress end-to-end tests on Netlify Build

## Install and use

You can install this plugin in the Netlify UI from this [direct in-app installation link](https://app.netlify.com/plugins/netlify-plugin-cypress/install) or from the [Plugins directory](https://app.netlify.com/plugins).

For file based installation, add `netlify-plugin-cypress` NPM package as a dev dependency to your repository.

```shell
npm install --save-dev netlify-plugin-cypress
# or
yarn add -D netlify-plugin-cypress
```

And then add the plugin's name to the list of build plugins in `netlify.toml` file as shown in the examples below.

*note:* this plugin assumes you have already installed Cypress as a dev NPM dependency.

### Chromium install

This plugin installs [via Puppeteer](https://github.com/puppeteer/puppeteer) Chromium browser, which is also cached inside `./node_modules` folder.

## How does it work

### Build steps

When Netlify Build system runs it performs 2 steps essentially:

1. builds the site
2. deploys the site

Every plugin that wants to perform some actions can do so before the build, after the build (but before the deploy), and after the deploy. The Netlify uses the following names for these events

```
"preBuild"
1. builds the site
"postBuild"
2. deploys the site
"onSuccess"
"onFailure"
```

Thus every plugin can register itself to be executed before a site is built using "preBuild" event, or after a successful deploy using "onSuccess" event name, etc.

### This plugin

This plugin `netlify-plugin-cypress` by default runs during the "onSuccess" event, testing the deployed site. The Netlify Build system gives the URL to the plugin and it runs Cypress against that URL using the [Cypress NPM module API](https://on.cypress.io/module-api).

Optionally, you can also run tests during "preBuild" and "postBuild" steps. This is useful if you want to ensure the site is working even before deploying it to Netlify servers. Finally, this plugin does not use "onFailure" event which happens only if Netlify fails to deploy the site.

### Failing the deploy

Running Cypress tests by default uses the "onSuccess" step of the build pipeline. By this point Netlify has already deployed the site. Even if the tests fail now, the Netlify shows the successful deployment - the site is live! To really prevent the broken deploys, we suggest using [Cypress GitHub / GitLab / Bitbucket integration](https://on.cypress.io/github-integration) to fail the _status checks_ on a pull request.

We also suggest running tests during the "preBuild" and/or "postBuild" steps. If the tests fail during these steps, the Netlify fails the entire build and does not deploy the broken site.

Finally, you can set up [Slack notifications](https://on.cypress.io/slack-integration) on failed tests against the deployed site. At least you will quickly find out if the deployed site fails the E2E tests and would be able to roll back the deploy.

## Examples

### basic

Here is the most basic [Netlify config file](https://docs.netlify.com/configure-builds/file-based-configuration/) `netlify.toml` with just the Cypress plugin

```toml
[[plugins]]
  # runs Cypress tests against the deployed URL
  package = "netlify-plugin-cypress"
```

The example file above should be enough to run Cypress tests in any existing Netlify project.

### recommended

We strongly recommend setting `CYPRESS_CACHE_FOLDER` to place the Cypress binary _inside the node_modules_ folder to [cache it between builds](https://on.cypress.io/caching)

```toml
# explicit commands for building the site
# and the folder to publish
[build]
command = "npm run build"
publish = "build"

[build.environment]
# cache Cypress binary in local "node_modules" folder
# so Netlify caches it
CYPRESS_CACHE_FOLDER = "./node_modules/CypressBinary"
# set TERM variable for terminal output
TERM = "xterm"

[[plugins]]
# runs Cypress tests against the deployed URL
package = "netlify-plugin-cypress"
```

See [netlify-plugin-cypress-example](https://github.com/cypress-io/netlify-plugin-cypress-example) repo.

Typescript users may need to add a `install` before the build command. For a yarn user with a typescript app, the build section of the Netlify configuration might look like this:

```toml
[build]
command = "yarn install && yarn build"
publish = "build"

# ...remaining configuration...
```

### tutorial

Read the full tutorial at [Test Sites Deployed To Netlify Using netlify-plugin-cypress](https://glebbahmutov.com/blog/test-netlify/).

**Note:** if any tests against the deployed URL fail, the Netlify build still considers it a success. Thus if you want to have a test check against the deploy, install [Cypress GitHub App](https://on.cypress.io/github-integration). The app will provide its own failing status check in this case.

### options

You can control the browser, the specs to run, record tests on Cypress Dashboard, etc, see [manifest.yml](./manifest.yml) file.

### recording

To record test results and artifacts on Cypress Dashboard, set `record: true` plugin input and set `CYPRESS_RECORD_KEY` as an environment variable via Netlify Deploy settings.

```yaml
[build]
command = "npm run build"
publish = "build"
  [build.environment]
  # cache Cypress binary in local "node_modules" folder
  # so Netlify caches it
  CYPRESS_CACHE_FOLDER = "./node_modules/CypressBinary"
  # set TERM variable for terminal output
  TERM = "xterm"

[[plugins]]
# runs Cypress tests against the deployed URL
package = "netlify-plugin-cypress"
  [plugins.inputs]
  record = true
```

See [cypress-example-kitchensink](https://github.com/cypress-io/cypress-example-kitchensink) and recorded results at Cypress Dashboard [![netlify-plugin-cypress](https://img.shields.io/endpoint?url=https://dashboard.cypress.io/badge/simple/ixroqc/master&style=flat&logo=cypress)](https://dashboard.cypress.io/projects/ixroqc/runs)

**Security note 🔐:** you should keep your `CYPRESS_RECORD_KEY` secret. You can control how Netlify builds external pull requests, see [the doc](https://docs.netlify.com/configure-builds/environment-variables/) - you never want to expose sensitive environment variables to outside builds.

#### status checks

If you are recording test results to Cypress Dashboard, you should also install [Cypress GitHub Integration App](https://on.cypress.io/github-integration) to see status checks from individual groups or from individual specs per commit. See [netlify-plugin-prebuild-example PR #8](https://github.com/cypress-io/netlify-plugin-prebuild-example/pull/8) pull request for an example.

![Netlify to Cypress Dashboard to GH Integration checks](./images/netlify-to-cy-gh-app-checks.png)

#### group

You can change the group name for the recorded run using `group` parameter

```toml
[[plugins]]
# runs Cypress tests against the deployed URL
package = "netlify-plugin-cypress"
  [plugins.inputs]
  record = true
  group = "built site"
```

#### tag

You can give recorded run [tags](https://on.cypress.io/module-api#cypress-run) using a comma-separated string. If the tag is not specified, Netlify context will be used (`production`, `deploy-preview` or `branch-deploy`)

```toml
[[plugins]]
# runs Cypress tests against the deployed URL
package = "netlify-plugin-cypress"
  [plugins.inputs]
  record = true
  group = "built site"
  tag = "nightly,production"
```

### spec

Run only a single spec or specs matching a wildcard

```toml
[build]
command = "npm run build"
publish = "build"
  [build.environment]
  # cache Cypress binary in local "node_modules" folder
  # so Netlify caches it
  CYPRESS_CACHE_FOLDER = "./node_modules/CypressBinary"
  # set TERM variable for terminal output
  TERM = "xterm"

[[plugins]]
# runs Cypress tests against the deployed URL
package = "netlify-plugin-cypress"
  [plugins.inputs]
  spec = "cypress/integration/smoke*.js"
```

See [cypress-example-kitchensink](https://github.com/cypress-io/cypress-example-kitchensink) for instance.

### browser

By default all tests run using the Chromium browser. If you want to use Electron:

```toml
[build]
command = "npm run build"
publish = "build"
  [build.environment]
  # cache Cypress binary in local "node_modules" folder
  # so Netlify caches it
  CYPRESS_CACHE_FOLDER = "./node_modules/CypressBinary"
  # set TERM variable for terminal output
  TERM = "xterm"

[[plugins]]
package = "netlify-plugin-cypress"
  [plugins.inputs]
  # allowed values: electron, chromium
  browser = "electron"
```

### configFile

If you would like to use a different Cypress config file instead of `cypress.json`, specify it using the `configFile` option

```toml
[build]
command = "npm run build"
publish = "build"
  [build.environment]
  # cache Cypress binary in local "node_modules" folder
  # so Netlify caches it
  CYPRESS_CACHE_FOLDER = "./node_modules/CypressBinary"
  # set TERM variable for terminal output
  TERM = "xterm"

[[plugins]]
package = "netlify-plugin-cypress"
  [plugins.inputs]
  configFile = "cypress.netlify.json"
```

### testing SPA routes

SPAs need catch-all redirect setup to make non-root paths accessible by tests. You can enable this with `spa` parameter.

```
[[plugins]]
# local Cypress plugin will test our site after it is built
package = "netlify-plugin-cypress"
  [plugins.inputs]
  # can also use "spa = true" to use "index.html" by default
  spa = "index.html"
```

See [lws-spa](https://github.com/lwsjs/spa) for more options and [tests/routing](tests/routing) example.

### testing the site before build

By default this plugin tests static site _after deploy_. But maybe you want to run end-to-end tests against the _local development server_. You can start the local server, wait for it to respond and then run Cypress tests by passing parameters to this plugin. Here is a sample config file

```toml
[[plugins]]
  package = "netlify-plugin-cypress"
  # let's run tests against development server
  # before building it (and testing the built site)
  [plugins.inputs.preBuild]
    enable = true
    start = 'npm start'
    wait-on = 'http://localhost:5000'
    wait-on-timeout = '30' # seconds
```

Parameters you can place into `preBuild` inputs: `start`, `wait-on`, `wait-on-timeout`, `spec`, `record`, `group`, and `tag`.

See [netlify-plugin-prebuild-example](https://github.com/cypress-io/netlify-plugin-prebuild-example) repo

### testing the site after build

By default this plugin tests static site _after deploy_. But maybe you want to run end-to-end tests locally after building the static site. Cypress includes a local static server for this case but you can specify your own command if needed by using the `start` argument. Here is a sample config file

```toml
[[plugins]]
  package = "netlify-plugin-cypress"
  # let's run tests against the built site
  [plugins.inputs.postBuild]
    enable = true
```

Parameters you can place into `postBuild` inputs: `spec`, `record`, `group`, `tag`, `start` and `spa`.

#### The SPA parameter

If your site requires all unknown URLs to redirect back to the index page, use the `spa` parameter

```toml
[[plugins]]
  package = "netlify-plugin-cypress"
  # let's run tests against the built site
  [plugins.inputs.postBuild]
    enable = true
    # must allow our test server to redirect unknown routes to "/"
    # so that client-side routing can correctly route them
    # can be set to true or "index.html" (or similar fallback filename in the built folder)
    spa = true
    start = 'npm start'
```

See [the routing example](./tests/routing/netlify.toml).

### using Netlify CLI

Even better when testing the prebuilt site is to run the [Netlify CLI](https://cli.netlify.com/) to make sure the local API redirects and Netlify functions work in addition to the web site. Add `netlify-cli` as a dev dependency and start it during testing.

```shell
$ npm i -D netlify-cli
```

```toml
[[plugins]]
  package = "netlify-plugin-cypress"
  # start Netlify server
  [plugins.inputs.preBuild]
    start = 'npx netlify dev'
    wait-on = 'http://localhost:8888'
```

For more, see [tests/test-netlify-dev](./tests/test-netlify-dev) example and read [Testing Netlify Function](https://glebbahmutov.com/blog/test-netlify/#testing-netlify-functions) section.

### skipping tests

If you are testing the site before building it and want to skip testing the deployed URL

```toml
[[plugins]]
  package = "netlify-plugin-cypress"
  # do not test the deployed URL
  [plugins.inputs]
    enable = false
  # test the local site
  [plugins.inputs.preBuild]
    enable = true
```

### parallelization

Running tests in parallel **is not supported** because Netlify plugin system runs on a single machine. Thus you can record the tests on Cypress Dashboard, but not run tests in parallel. If Netlify expands its build offering by allowing multiple build machines, we could take advantage of it and run tests in parallel.

### HTML files

When serving the built folder, we automatically serve `.html` files. For example, if your folder has the following structure:

```
public/
  index.html
  pages/
    about.html
```

The `public` folder is served automatically and the following test successfully visits both the root and the `about.html` pages:

```js
cy.visit('/')
cy.visit('/pages/about') // visits the about.html
```

## Example repos

Name | Description
--- | ---
[netlify-plugin-cypress-example](https://github.com/cypress-io/netlify-plugin-cypress-example) | Runs Cypress tests on Netlify and records their results to Cypress Dashboard
[netlify-plugin-prebuild-example](https://github.com/cypress-io/netlify-plugin-prebuild-example) | Runs tests twice, first using the development version of the site, then after Netlify builds the production bundles, runs the tests again
[cypress-example-kitchensink](https://github.com/cypress-io/cypress-example-kitchensink) | Runs only a subset of all tests before publishing the folder to Netlify
[bahmutov/eleventyone](https://github.com/bahmutov/eleventyone) | Example used in [Test Sites Deployed To Netlify Using netlify-plugin-cypress](https://glebbahmutov.com/blog/test-netlify/) tutorial
[gatsby-starter-portfolio-cara](https://github.com/bahmutov/gatsby-starter-portfolio-cara) | A Gatsby site example

## Major upgrades

### v1 to v2

- The default browser has been switched to Chromium. If you want to use the built-in Electron use an explicit option [browser](#browser)
- We have changed the default testing phase. In v1 the tests executed after building the site by default. In v2 the tests run against the deployed URL by default, and you need to enable the testing during `preBuild` or `postBuild` steps.

## Debugging

Set environment variable `DEBUG=netlify-plugin-cypress` to see the debug logs. To see even more information, set `DEBUG=netlify-plugin-cypress,netlify-plugin-cypress:verbose`

**Warning:** be careful with verbose logging, since it can print all environment variables passed to the plugin, including tokens, API keys, and other secrets.

## Common problems

<details>
  <summary>Too many progress messages while installing Cypress</summary>
  If you see A LOT of progress messages during "npm install" step, set an environment
  variable during build <code>CI = 1</code> to remove them.
</details>

<details>
  <summary>Cypress binary is installed on every build</summary>
  By default Cypress binary is installed in the home folder, see <a href="">caching</a>.
  Netlify build does NOT cache this folder, but it DOES cache the local "node_modules" folder.
  Tell Cypress to install its binary in the "node_modules" folder by setting build environment
  variable <code>CYPRESS_CACHE_FOLDER = "./node_modules/CypressBinary"</code>.
</details>

<details>
  <summary>Several versions of Cypress are installed according to the build logs</summary>
  From the Netlify UI under Deploys, pick "Trigger Deploy" and select "Clear cache and deploy site". This should cleanly install new "node_modules" and remove old Cypress versions.
</details>

<details>
  <summary>Term message warnings in the Cypress output</summary>
  If you see messages like <code>tput: No value for $TERM and no -T specified</code> during
  Cypress run, add an environment variable <code>TERM = xterm</code>.
</details>

<details>
  <summary>Electron browser crashes while running tests</summary>
  Switch to using Chromium browser that seems to be a bit more reliable. Use <code>browser = "chromium"</code> setting.
</details>

<details>
  <summary>You want to skip Puppeteer download</summary>
  If you do not plan on using Chromium to run the tests, if you want to use the built-in Electron browser, you can save time by skipping the Puppeteer download. Set the environment variable <code>PUPPETEER_SKIP_DOWNLOAD = 1</code> on your CI.
</details>

## License

This project is licensed under the terms of the [MIT license](LICENSE.md).

## Contributing

Read the [contributing guide](CONTRIBUTING.md)

[renovate-badge]: https://img.shields.io/badge/renovate-app-blue.svg
[renovate-app]: https://renovateapp.com/
