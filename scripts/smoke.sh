#!/usr/bin/env bash
# Smoke test against a deployed URL. Usage: scripts/smoke.sh https://daily-smile.<sub>.workers.dev
set -euo pipefail
base="${1:?url}"
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi; }
# Never abort on a network error: report it as a FAIL and keep checking.
code() { curl -s -m 15 -o /dev/null -w '%{http_code}' "$@" || true; }

check "GET / serves the app" 200 "$(code "$base/")"
grep -q '<title>Daily Smile</title>' <(curl -s -m 15 "$base/" || true) && echo "ok   page is Daily Smile" || { echo "FAIL page title"; fail=1; }
check "GET /manifest.webmanifest" 200 "$(code "$base/manifest.webmanifest")"
check "GET /sw.js" 200 "$(code "$base/sw.js")"
key=$(curl -s -m 15 "$base/api/vapid-public-key" || true)
[[ "$key" =~ ^[A-Za-z0-9_-]{87}$ ]] && echo "ok   VAPID public key is set" || { echo "FAIL VAPID public key (got ${#key} chars)"; fail=1; }
check "POST /api/subscribe {} -> 400" 400 "$(code -X POST -H 'content-type: application/json' -d '{}' "$base/api/subscribe")"
check "POST text/plain -> 415" 415 "$(code -X POST -H 'content-type: text/plain' -d '{}' "$base/api/subscribe")"
check "foreign endpoint -> 400" 400 "$(code -X POST -H 'content-type: application/json' -d '{"subscription":{"endpoint":"https://example.com/x","keys":{"p256dh":"x","auth":"y"}},"time":"08:00","timeZone":"Europe/Rome"}' "$base/api/subscribe")"
check "GET /api/nope -> 404" 404 "$(code "$base/api/nope")"
hdr=$( (curl -sI -m 15 "$base/" || true) | tr -d '\r' | grep -i '^x-content-type-options:' || true)
[ -n "$hdr" ] && echo "ok   security headers present" || { echo "FAIL security headers missing"; fail=1; }
exit $fail
