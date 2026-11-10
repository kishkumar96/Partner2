#!/usr/bin/env bash
# scripts/perf-ci.sh
# Runs the full performance test suite against a production build on port 3002.
# Usage: npm run perf:ci
#
# Sequence:
#   1. next build (skipped if .next/ already exists)
#   2. lhci autorun  – LHCI manages the server lifecycle internally
#   3. Start server  – Playwright needs a live server
#   4. playwright test
#   5. Stop server
#
# Set HARD_GATE=true to promote soft-gate warnings to build failures.

set -euo pipefail

PORT=3002
REPORTS_DIR="reports"

echo "▶  Ensuring report directories exist…"
mkdir -p "$REPORTS_DIR/lighthouse" "$REPORTS_DIR/perf"

echo "▶  Checking for an existing production build (.next/)…"
if [ ! -d ".next" ]; then
  echo "   No .next/ found – running next build…"
  npm run build
else
  echo "   .next/ exists – skipping build."
fi

# ── Step 1: Lighthouse CI ──────────────────────────────────────────────────
echo ""
echo "▶  Running Lighthouse CI (LHCI manages its own server)…"
LHCI_EXIT=0
npx lhci autorun --config=lighthouserc.json || LHCI_EXIT=$?
echo "   LHCI finished (exit=$LHCI_EXIT)."

# ── Step 2: Playwright – start server then test ────────────────────────────
echo ""
echo "▶  Starting Next.js server on port $PORT for Playwright…"
npm run start &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "▶  Stopping server (PID $SERVER_PID)…"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "▶  Waiting for server to become ready…"
READY=false
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT" -o /dev/null 2>/dev/null; then
    READY=true
    break
  fi
  sleep 1
done

if [ "$READY" != "true" ]; then
  echo "✖  Server on port $PORT did not become ready within 60 seconds."
  exit 1
fi

echo "▶  Server is ready."

PW_EXIT=0
echo "▶  Running Playwright perf flows…"
npx playwright test --config=playwright.config.ts || PW_EXIT=$?
echo "   Playwright finished (exit=$PW_EXIT)."

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
TOTAL_EXIT=$(( LHCI_EXIT + PW_EXIT ))

if [ "$TOTAL_EXIT" -eq 0 ]; then
  echo "✔  All performance checks passed."
  echo "   Reports: $REPORTS_DIR/lighthouse/  $REPORTS_DIR/perf/"
else
  echo "⚠  Performance budget violations detected."
  echo "   LHCI exit=$LHCI_EXIT  Playwright exit=$PW_EXIT"
  echo "   Reports: $REPORTS_DIR/lighthouse/  $REPORTS_DIR/perf/"

  if [ "${HARD_GATE:-false}" = "true" ]; then
    echo "✖  HARD_GATE=true – failing the build."
    exit "$TOTAL_EXIT"
  else
    echo "   Running in soft-gate mode – set HARD_GATE=true to fail the build."
  fi
fi
