#!/bin/bash
set -euo pipefail

# Post-deploy health verification for FNC ERP production.
# Run after `pm2 reload` from the deploy.yml SSH script. Polls every HTTP
# service's /health endpoint and the worker's PM2 status; on success marks
# the current commit as .last-good-deploy (consumed by scripts/rollback.sh).
#
# Pulled out of deploy.yml's inline script because appleboy/ssh-action's
# transport of a large inline multi-line script silently dropped this
# loop's output entirely (confirmed: identical logic ran correctly when
# pasted directly into an interactive SSH session on the VPS). Running it
# as a real file delivered via the normal git checkout sidesteps whatever
# that transport quirk is.

APP_DIR="/opt/fnc-erp"
cd "${APP_DIR}"

NEW_SHA=$(git rev-parse HEAD)

echo "Waiting for services to report healthy..."
SERVICES="gateway:3000 auth:3001 finance:3002 hr:3004 inventory:3005 projects:3006 notifications:3009 rental:3010 reporting:3011"
FAILED=0
for entry in $SERVICES; do
  svc="${entry%%:*}"
  port="${entry##*:}"
  ok=0
  for i in $(seq 1 15); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${port}/health" || echo "000")
    if [ "$code" = "200" ]; then ok=1; break; fi
    sleep 2
  done
  if [ "$ok" -eq 0 ]; then
    echo "::error::HEALTH CHECK FAILED — $svc (port $port) did not return 200 within 30s"
    FAILED=1
  else
    echo "OK: $svc healthy"
  fi
done

WORKER_STATUS=$(pm2 jlist | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const w=d.find(p=>p.name==='worker');console.log(w?w.pm2_env.status:'missing')")
if [ "$WORKER_STATUS" != "online" ]; then
  echo "::error::HEALTH CHECK FAILED — worker process status=$WORKER_STATUS"
  FAILED=1
fi

if [ "$FAILED" -eq 1 ]; then
  echo "::error::Deploy of $NEW_SHA FAILED health verification. Code is live but NOT marked as last-good."
  echo "::error::To roll back immediately, SSH in and run: /opt/fnc-erp/scripts/rollback.sh"
  exit 1
fi

echo "$NEW_SHA" > "${APP_DIR}/.last-good-deploy"
echo "Deploy verified healthy. $NEW_SHA marked as last-good-deploy."
