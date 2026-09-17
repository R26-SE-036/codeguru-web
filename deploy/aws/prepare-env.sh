#!/usr/bin/env bash
# Write deploy/aws/env/ - one env file per service - from the local .env files,
# without the settings that must not reach a public server.
#
#   deploy/aws/prepare-env.sh
#
# The output holds every credential the platform has. It is git-ignored, and is
# copied to the server over SSH, never committed or sent anywhere else.
#
# Removed on the way:
#   CODE_RUNNER_ALLOW_UNSANDBOXED  runs student code outside the sandbox
#   INTEGRATION_*                  a test account's password, for local tests
#   PORT                           the gamification file sets it for Node, and
#                                  the ML service reads the same file
# Service addresses and CORS origins in these files are overridden by
# docker-compose.yml, so their laptop values do no harm.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$HERE/env"

umask 077
mkdir -p "$OUT"

DROP='^(CODE_RUNNER_ALLOW_UNSANDBOXED|INTEGRATION_[A-Z_]+|PORT)='

copy() {
  local source="$ROOT/$1" target="$OUT/$2"
  if [ ! -f "$source" ]; then
    echo "missing: $1" >&2
    exit 1
  fi
  grep -vE "$DROP" "$source" | tr -d '\r' > "$target"
  echo "wrote env/$2 ($(grep -cE '^[A-Z_]' "$target") settings)"
}

copy codeguru-web/.env.local                 web.env
copy code-coach/backend/.env                 code-coach.env
copy Study-Guider/backend/.env               study-guider.env
copy Pair_Path/backend/.env                  pairpath-api.env
copy adaptive-gamification-engine/backend/.env gamification.env
