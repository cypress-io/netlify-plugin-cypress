# netlify-plugin-cypress
> Runs Cypress end-to-end tests after Netlify builds the site

**Note:** currently the built site is served statically and tested _without proxying redirects_.

## Examples

### basic

```yaml
# Netlify config file
build:
  command: "npm run build"
  publish: "build"
  environment:
    # do not show Cypress installation progress messages
    CI: 1
    # cache Cypress binary in local "node_modules" folder
    # so Netlify caches it
    CYPRESS_CACHE_FOLDER: "./node_modules/CypressBinary"
    # set TERM variable for terminal output
    TERM: "xterm"

plugins:
  # local Cypress plugin will test our site after it is built
  - package: netlify-plugin-cypress
```

### recording

To record test results and artifacts on Cypress Dashboard, set `record: true` plugin input and set `CYPRESS_RECORD_KEY` as an environment variable via Netlify Deploy settings.

```yaml
# Netlify config file
build:
  command: "npm run build"
  publish: "build"
  environment:
    # do not show Cypress installation progress messages
    CI: 1
    # cache Cypress binary in local "node_modules" folder
    # so Netlify caches it
    CYPRESS_CACHE_FOLDER: "./node_modules/CypressBinary"
    # set TERM variable for terminal output
    TERM: "xterm"

plugins:
  # local Cypress plugin will test our site after it is built
  - package: netlify-plugin-cypress
    config:
      record: true
```

## Debugging

Set environment variable `DEBUG=netlify-plugin-cypress` to see the debug logs. To see even more information, set `DEBUG=netlify-plugin-cypress,netlify-plugin-cypress:verbose`

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
  <summary>Cypress binary is missing</summary>
  If you see error messages from `cypress` NPM module <code>Error: The cypress npm package is installed, but the Cypress binary is missing.</code> add to your repository <code>package.json</code> scripts <code>"postinstall": "cypress install"</code> command.
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

## License

This project is licensed under the terms of the [MIT license](/LICENSE.md).
