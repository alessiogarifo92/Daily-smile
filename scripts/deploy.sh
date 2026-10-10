#!/usr/bin/env bash
# Deploys Daily Smile to Cloudflare from CI. Usage: scripts/deploy.sh <git-branch>
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment, and `npm run build` done.
#   main          -> production deploy (the live site)
#   other branch  -> preview version with its own URL; production stays untouched
# The very first run creates the Worker (a preview needs an existing Worker) and its VAPID keys.
set -euo pipefail
branch="${1:?branch name}"
cfg=worker/wrangler.toml
wr() { ${WRANGLER:-npx --no-install wrangler} "$@" -c "$cfg"; }
summary() { echo "$*" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"; }

# Additive migrations only, so applying them before the code (and from previews) is safe.
wr d1 migrations apply DB --remote

if [ "$branch" = main ] || ! wr deployments list >/dev/null 2>&1; then
  out=$(wr deploy 2>&1) || { echo "$out"; exit 1; }
  echo "$out"
  url=$(grep -Eo 'https://[a-z0-9.-]+\.workers\.dev' <<<"$out" | head -1)
  summary "Production: ${url:-see log}"
else
  alias=$(tr -c 'a-z0-9-' '-' <<<"${branch,,}" | sed 's/-\+/-/g; s/^-//; s/-$//' | cut -c1-40)
  out=$(wr versions upload --preview-alias "$alias" --message "branch $branch" 2>&1) || { echo "$out"; exit 1; }
  echo "$out"
  url=$(grep -Eo 'https://[a-z0-9.-]+\.workers\.dev' <<<"$out" | grep -- "$alias" | head -1)
  [ -n "$url" ] || url=$(grep -Eo 'https://[a-z0-9.-]+\.workers\.dev' <<<"$out" | head -1)
  summary "Preview ($branch): ${url:-see log}"
fi
echo "url=${url:-}" >> "${GITHUB_OUTPUT:-/dev/null}"

# One-time setup: generate the VAPID key pair inside the runner and store it as Worker secrets.
# The private key is never printed, committed or seen by anyone.
existing=$(wr secret list --format json 2>/dev/null || echo '[]')
if ! grep -q '"VAPID_PRIVATE_KEY"' <<<"$existing"; then
  keys=$(node scripts/gen-vapid.mjs)
  pub=$(sed -n 's/^VAPID_PUBLIC_KEY=//p' <<<"$keys")
  priv=$(sed -n 's/^VAPID_PRIVATE_KEY=//p' <<<"$keys")
  echo "::add-mask::$priv"
  file=$(mktemp)
  chmod 600 "$file"
  trap 'rm -f "$file"' EXIT
  # Subject: a contact URL for push services, so no personal email lands in a public place.
  printf '{"VAPID_PUBLIC_KEY":"%s","VAPID_PRIVATE_KEY":"%s","VAPID_SUBJECT":"https://github.com/alessiogarifo92/Daily-smile"}' "$pub" "$priv" >"$file"
  wr secret bulk "$file"
  rm -f "$file"
  summary "VAPID keys generated and stored as Worker secrets."
fi
