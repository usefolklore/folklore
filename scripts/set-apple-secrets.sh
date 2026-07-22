#!/usr/bin/env bash
# Push Apple signing/notarization secrets to GitHub Actions from local files.
# Values live in ~/.apple-signing (created 2026-07-21) and .envrc.local — never in git.
set -euo pipefail
SIGN="$HOME/.apple-signing"

gh secret set APPLE_CERTIFICATE < "$SIGN/folklore-devid.p12.b64"
gh secret set APPLE_CERTIFICATE_PASSWORD < "$SIGN/p12-password.txt"
gh secret set APPLE_SIGNING_IDENTITY < "$SIGN/identity.txt"
printf '954TP5U8R9' | gh secret set APPLE_TEAM_ID
printf 'sahar.h.barak@gmail.com' | gh secret set APPLE_ID

# APPLE_PASSWORD (app-specific, for notarization) — set once it exists in .envrc.local
if grep -q '^export APPLE_PASSWORD=' .envrc.local 2>/dev/null; then
  grep '^export APPLE_PASSWORD=' .envrc.local | sed 's/^export APPLE_PASSWORD=//; s/^"//; s/"$//' | tr -d '\n' | gh secret set APPLE_PASSWORD
  echo "all 6 secrets set"
else
  echo "5 secrets set — APPLE_PASSWORD not in .envrc.local yet (notarization will stay off until it is)"
fi
gh secret list
