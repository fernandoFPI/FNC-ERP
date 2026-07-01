#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
REDIS_DUMP="/var/lib/redis/dump.rdb"
BACKUP_DIR="/var/backups/fnc-erp"
BACKUP_FILE="${BACKUP_DIR}/redis_${TIMESTAMP}.rdb.gz"
LOG_FILE="/var/log/fnc-erp/backup.log"

mkdir -p "${BACKUP_DIR}"

# Trigger Redis BGSAVE to flush in-memory data to disk
redis-cli BGSAVE
sleep 5

gzip -c "${REDIS_DUMP}" > "${BACKUP_FILE}"

b2 upload-file \
  --noProgress \
  "${B2_BACKUP_BUCKET}" \
  "${BACKUP_FILE}" \
  "redis/${TIMESTAMP}/redis_${TIMESTAMP}.rdb.gz"

echo "[$(date)] Redis backup uploaded to B2: redis/${TIMESTAMP}/" >> "${LOG_FILE}"
