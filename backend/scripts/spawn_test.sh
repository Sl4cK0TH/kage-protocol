#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-http://localhost:8000}
KAGE_KEY=${KAGE_KEY:-change-me}
CHALLENGE_ID=${CHALLENGE_ID:-1}

curl -sS -X POST "${API_BASE}/api/spawn/${CHALLENGE_ID}" \
  -H "X-Kage-Key: ${KAGE_KEY}" \
  -H "Content-Type: application/json" | jq

