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
PORT=5050
LOG=netlify-build.log

"$BIN/serve" public --listen "$PORT" > /dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2> /dev/null || true' EXIT

# wait up to 30 seconds for the server to respond
for _ in $(seq 1 30); do
  curl --silent --fail "http://localhost:$PORT" > /dev/null && break
  sleep 1
done

"$BIN/netlify" build --offline 2>&1 | tee "$LOG"

fail() {
  echo ""
  echo "❌ onSuccess check failed: $1"
  exit 1
}

grep --quiet "testing deployed url http://localhost:$PORT" "$LOG" ||
  fail "onSuccess did not test the local \"deployed\" URL"
grep --quiet "All specs passed!" "$LOG" ||
  fail "Cypress specs did not all pass"
if grep --quiet 'Plugin "../../" failed' "$LOG"; then
  fail "the plugin reported a failure"
fi

echo ""
echo "✅ onSuccess tests ran against the local deploy URL and passed"
