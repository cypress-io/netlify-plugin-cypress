How to [code a plugin](https://github.com/netlify/build/blob/master/docs/creating-a-plugin.md)

## Testing

End-to-end tests are in folder [tests](tests). Each subfolder uses this [plugin locally](https://github.com/netlify/build/blob/master/README.md#using-a-local-plugin) and runs a Netlify build with the Netlify CLI on [GitHub Actions](.github/workflows/ci.yml). You can find the test recordings at [Cypress Cloud](https://cloud.cypress.io/projects/ixroqc/)

The builds use `netlify build --offline`, so you don't need a Netlify account, a linked site, or an access token to run them, locally or on GitHub Actions.

To run locally, from a subfolder of `tests`:

- if it has a `netlify:build` script, run `npm run netlify:build`
- otherwise, run `npx netlify build --offline`

### Testing the onSuccess step

Most fixtures turn off the default `onSuccess` step, since there's no real deploy to test. The [tests/on-success](tests/on-success) fixture covers it, along with how the plugin reports skipped and pending tests, by serving the built site locally and pointing `DEPLOY_PRIME_URL` at that server. Netlify doesn't fail the build when `onSuccess` fails, so its `test.sh` script checks the build output instead.

The fixture also records to Cypress Cloud when `CYPRESS_RECORD_KEY` is set, and `test.sh` then checks that the run was recorded. Without the key, the plugin skips recording and `test.sh` skips that check.

## Releasing a new version

The `release` job in the [CI workflow](.github/workflows/ci.yml) runs `semantic-release` after every push, once the unit tests and all end-to-end jobs pass. It needs two secrets in the repository settings:

- `NPM_TOKEN` to publish to NPM (GitHub provides `GITHUB_TOKEN` for tags and releases)
- `CYPRESS_RECORD_KEY` so the recording fixtures record to Cypress Cloud

Before releasing check that each end-to-end job has actually run the tests correctly. We don't have a way to check if Cypress _executed all tests_, other than looking at the job's log on GitHub Actions.

Try using `beta` branch to release new pre-release versions of the plugin by following [the semantic release guide](https://github.com/semantic-release/semantic-release/blob/master/docs/recipes/pre-releases.md). You can fork and test out new versions published to NPM using the [netlify-plugin-cypress-example](https://github.com/cypress-io/netlify-plugin-cypress-example) repository. Hope the `master` branch merged into `beta` does not bring features and fixes *already released*. Thus I suggest using `beta` branch for new features.

The `release` job only runs on `push` events, never on `pull_request` events, so an open pull request from the `beta` branch doesn't stop semantic-release from publishing a pre-release. You can watch the [`beta` builds on GitHub Actions](https://github.com/cypress-io/netlify-plugin-cypress/actions/workflows/ci.yml?query=branch%3Abeta).
