#!/usr/bin/env bash
# Every test suite on the platform, then one summary.
#
#   deploy/test-all.sh           the hermetic suites of every component - no stack needed
#   deploy/test-all.sh --live    those, then the suites that exercise the running stack
#
# ── The layers ───────────────────────────────────────────────────────────────
#   unit and service tests   each component on its own, backends stubbed or in
#                            memory: web app, Code Coach, Study Guider, PairPath
#                            API and ML, the code runner, gamification API and ML
#   system (--live)          the whole platform through its public address, the
#                            way a browser and the editor reach it
#   browser (--live)         a real browser (the installed Edge) against the stack
#   extension (--live)       the VS Code extension inside VS Code; its live suite
#                            signs in and analyses through the same edge
#
# --live needs the stack up and healthy:
#     cd codeguru-web/deploy && docker compose up -d --wait
#
# The live suites create clearly named accounts on example.com in the real
# databases. Lesson and quiz generation spend the Gemini quota and run only with
# SYSTEM_TESTS_LLM=1.
#
# Not run here: PairPath's and the gamification engine's own integration suites.
# They expect their services on host ports, which the compose stack deliberately
# does not publish; the system suite covers the same contracts through the edge.
#
# Exits non-zero if any suite failed.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIVE=0
[ "${1:-}" = "--live" ] && LIVE=1

results=()

# A project's own virtualenv interpreter, on Windows or anywhere else.
py() {
  if [ -x .venv/Scripts/python.exe ]; then .venv/Scripts/python.exe "$@"; else .venv/bin/python "$@"; fi
}

run() {
  local name="$1" dir="$2"
  shift 2
  printf '\n\033[1m=== %s\033[0m  (%s)\n' "$name" "$dir"
  local started=$SECONDS
  if (cd "$ROOT/$dir" && "$@"); then
    results+=("PASS  $(printf '%4ss' $((SECONDS - started)))  $name")
  else
    results+=("FAIL  $(printf '%4ss' $((SECONDS - started)))  $name")
  fi
}

run "Web app - unit"              codeguru-web                        npm test --silent
run "Web app - types"             codeguru-web                        npm run typecheck --silent
run "Code Coach - backend"        code-coach/backend                  py -m pytest -q -p no:cacheprovider
run "Study Guider - backend"      Study-Guider/backend                py -m pytest -q -p no:cacheprovider
run "PairPath - API unit"         Pair_Path/backend                   npx jest --silent
run "PairPath - ML service"       Pair_Path/backend/ml                py -m pytest -q -p no:cacheprovider tests
run "PairPath - code runner"      Pair_Path/code-runner-lambda        npm test --silent
run "Gamification - API unit"     adaptive-gamification-engine/backend     npm test --silent
run "Gamification - ML service"   adaptive-gamification-engine/backend/ml  py -m pytest -q -p no:cacheprovider tests

if [ "$LIVE" = 1 ]; then
  unhealthy="$(cd "$ROOT/codeguru-web/deploy" && docker compose ps --format '{{.Service}} {{.Status}}' 2>&1 | grep -v '(healthy)' | grep -v '^caddy ')"
  if [ -n "$unhealthy" ]; then
    printf '\n\033[1;31mThe stack is not up and healthy, so the live suites were not run:\033[0m\n%s\n' "$unhealthy"
    results+=("FAIL     -  Live suites (stack not healthy)")
  else
    run "Platform - system"         codeguru-web                        npm run test:system --silent
    run "Platform - browser"        codeguru-web                        npm run test:e2e --silent
    run "Code Coach - VS Code extension" code-coach/extension/code-coach-vscode npm test --silent
  fi
fi

printf '\n\033[1m=== Summary\033[0m\n'
failed=0
for line in "${results[@]}"; do
  case "$line" in
    PASS*) printf '\033[32m%s\033[0m\n' "$line" ;;
    *) printf '\033[31m%s\033[0m\n' "$line"; failed=1 ;;
  esac
done
[ "$LIVE" = 1 ] || printf '\n(hermetic suites only - add --live for the system, browser and extension suites)\n'
exit $failed
