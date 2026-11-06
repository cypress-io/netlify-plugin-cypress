#!/usr/bin/env bash
# Exercises the plugin's default "onSuccess" step without a real Netlify deploy.
#
# A local static server stands in for the deployed site, and netlify.toml
# points DEPLOY_PRIME_URL at it. The build runs with --offline, so no
# Netlify site or access token is needed.
#
# Netlify reports onSuccess failures with failPlugin, which does NOT change
# the build's exit code, so we check the build output to catch them.
set -euo pipefail

cd "$(dirname "$0")"
BIN=../../node_modules/.bin
LOG=netlify-build.log

# netlify.toml is the single source of truth for the "deployed" URL
DEPLOY_URL=$(sed -n 's/^ *DEPLOY_PRIME_URL *= *"\(.*\)".*/\1/p' netlify.toml)
PORT=${DEPLOY_URL##*:}
if [ -z "$DEPLOY_URL" ] || ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "❌ could not read DEPLOY_PRIME_URL with a port from netlify.toml"
  exit 1
fi

# "serve" quietly picks another port when this one is taken
# (even with --no-port-switching), so make sure the port is free first
if ! node -e "require('net').createServer().once('error', () => process.exit(1)).listen($PORT, () => process.exit(0))"; then
  echo "❌ port $PORT is already in use, stop whatever is using it and try again"
  exit 1
fi

"$BIN/serve" public --listen "$PORT" > /dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2> /dev/null || true' EXIT

# stop with a clear error if the server never comes up (60s timeout)
if ! node ../../src/ping-cli.js "$DEPLOY_URL"; then
  echo "❌ static server did not start at $DEPLOY_URL"
  exit 1
fi

"$BIN/netlify" build --offline 2>&1 | tee "$LOG"

fail() {
  echo ""
  echo "❌ onSuccess check failed: $1"
  exit 1
}

grep --quiet --fixed-strings "testing deployed url $DEPLOY_URL" "$LOG" ||
  fail "onSuccess did not test the local \"deployed\" URL"
grep --quiet "All specs passed!" "$LOG" ||
  fail "Cypress specs did not all pass"
if grep --quiet --fixed-strings 'Plugin "../../" failed' "$LOG"; then
  fail "the plugin reported a failure"
fi

echo ""
echo "✅ onSuccess tests ran against the local deploy URL and passed"
