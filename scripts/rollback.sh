#!/bin/bash
set -euo pipefail

# One-command manual rollback for FNC ERP production.
# Usage (run ON THE VPS, as the deploy user, from anywhere):
#   /opt/fnc-erp/scripts/rollback.sh              # rolls back to .last-good-deploy
#   /opt/fnc-erp/scripts/rollback.sh <commit-sha>  # rolls back to an explicit SHA
#
# NOTE: this reverts APPLICATION CODE ONLY. It does NOT revert any database
# migration — packages/db/migrations/run-migrations.ts is forward-only with
# no down migrations, tracked in schema_migrations. Only roll back across a
# migration boundary if you've manually confirmed the target code version is
# compatible with the CURRENT (already-migrated) schema.

APP_DIR="/opt/fnc-erp"
MARKER_FILE="${APP_DIR}/.last-good-deploy"
LOG_FILE="/var/log/fnc-erp/rollback.log"

cd "${APP_DIR}"

TARGET_SHA="${1:-}"
if [ -z "${TARGET_SHA}" ]; then
  if [ ! -f "${MARKER_FILE}" ]; then
    echo "ERROR: no SHA given and ${MARKER_FILE} does not exist. Pass a SHA explicitly." | tee -a "${LOG_FILE}"
    exit 1
  fi
  TARGET_SHA=$(cat "${MARKER_FILE}")
fi

CURRENT_SHA=$(git rev-parse HEAD)
echo "[$(date)] Rolling back from ${CURRENT_SHA} to ${TARGET_SHA}" | tee -a "${LOG_FILE}"

git fetch origin production
git checkout "${TARGET_SHA}"

pnpm install --frozen-lockfile
pnpm build --concurrency=4

set -a
source .env
set +a
# Deliberately no `pnpm migrate` here — see note above.

pm2 reload ecosystem.config.cjs --env production --update-env

echo "[$(date)] Rollback to ${TARGET_SHA} complete." | tee -a "${LOG_FILE}"
echo "Verify with: pm2 status && curl -s http://localhost:3000/health"
