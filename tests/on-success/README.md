# onSuccess test

These tests run:
- [ ] before the build
- [ ] after the build
- [x] on deploy success

There's no real Netlify deploy here. `test.sh` starts a local static server to stand in for the deployed site, and `netlify.toml` points `DEPLOY_PRIME_URL` at it. The build runs with `--offline`, so it doesn't need a Netlify site or access token.

Netlify doesn't fail the build when `onSuccess` fails (the plugin uses `failPlugin`), so `test.sh` checks the build output instead of relying on the exit code.

```shell
npm run netlify:build
```
