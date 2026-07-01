#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/fnc-erp"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DB_NAME="fnc_erp_prod"
DB_USER="fnc_app"
BACKUP_FILE="${BACKUP_DIR}/fnc_erp_${TIMESTAMP}.sql.gz"
LOG_FILE="/var/log/fnc-erp/backup.log"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting database backup..." >> "${LOG_FILE}"

pg_dump \
  -U "${DB_USER}" \
  -h localhost \
  -d "${DB_NAME}" \
  --no-password \
  --format=plain \
  | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})" >> "${LOG_FILE}"

b2 upload-file \
  --noProgress \
  "${B2_BACKUP_BUCKET}" \
  "${BACKUP_FILE}" \
  "database/${TIMESTAMP}/fnc_erp_${TIMESTAMP}.sql.gz"

echo "[$(date)] Backup uploaded to B2: database/${TIMESTAMP}/" >> "${LOG_FILE}"

# Keep only last 7 days locally
find "${BACKUP_DIR}" -name "fnc_erp_*.sql.gz" -mtime +7 -delete
echo "[$(date)] Old local backups cleaned (kept last 7 days)" >> "${LOG_FILE}"

if gzip -t "${BACKUP_FILE}"; then
  echo "[$(date)] Backup integrity verified" >> "${LOG_FILE}"
else
  echo "[$(date)] ERROR: Backup file is corrupt!" >> "${LOG_FILE}"
  exit 1
fi

echo "[$(date)] Backup completed successfully" >> "${LOG_FILE}"
