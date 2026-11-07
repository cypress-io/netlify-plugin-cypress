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
# (accepts either "double" or 'single' quoted TOML strings)
DEPLOY_URL=$(sed -n "s/^ *DEPLOY_PRIME_URL *= *[\"']\([^\"']*\)[\"'].*/\1/p" netlify.toml)
PORT=${DEPLOY_URL##*:}
if [ -z "$DEPLOY_URL" ] || ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "❌ could not read DEPLOY_PRIME_URL with a port from netlify.toml"
  exit 1
fi

# serve the folder with the same server the plugin uses during postBuild,
# it exits with an error if the port is already taken
SERVER_LOG=server.log
node ../../src/serve-cli.js public "$PORT" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2> /dev/null || true' EXIT

# wait up to 30 seconds for our server to report it is listening
for _ in $(seq 1 60); do
  grep --quiet "listening at" "$SERVER_LOG" && break
  if ! kill -0 "$SERVER_PID" 2> /dev/null; then
    cat "$SERVER_LOG"
    echo "❌ static server exited, is port $PORT already in use?"
    exit 1
  fi
  sleep 0.5
done
if ! grep --quiet "listening at" "$SERVER_LOG"; then
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
# spec.cy.js has 1 passing test plus 1 skipped and 1 pending test,
# which Cypress both counts as pending
grep --quiet --extended-regexp "Pending tests: 2([^0-9]|$)" "$LOG" ||
  fail "the plugin summary did not report 2 pending tests"
# Netlify titles a reported failure 'Plugin "../../" failed' and a thrown
# error 'Plugin "../../" internal error', so match the shared prefix
# the plugin only records when the key is present, and quietly skips
# recording otherwise, so only check for a recorded run when it can happen
if [ -n "${CYPRESS_RECORD_KEY:-}" ]; then
  grep --quiet "Recorded Run:" "$LOG" ||
    fail "CYPRESS_RECORD_KEY is set, but the run was not recorded"
else
  echo "ℹ️  CYPRESS_RECORD_KEY is not set, skipping the recording check"
fi
if grep --quiet --fixed-strings 'Plugin "../../" ' "$LOG"; then
  fail "the plugin reported a failure"
fi

echo ""
echo "✅ onSuccess tests ran against the local deploy URL and passed"
