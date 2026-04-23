#!/bin/bash
# ============================================================
# Shenmay AI — Hetzner SaaS DB Backup
#
# Runs on the Hetzner prod VM (`ssh nomii@204.168.232.24`).
# Daily pg_dump of the shenmay_ai database, gzipped, kept 14 days.
#
# Deploy:
#   scp scripts/hetzner-backup.sh nomii@204.168.232.24:~/nomii-backup.sh
#   ssh nomii@204.168.232.24 "chmod +x ~/nomii-backup.sh && ~/nomii-backup.sh \
#     && (crontab -l 2>/dev/null | grep -v nomii-backup; echo '0 3 * * * /home/nomii/nomii-backup.sh >> /home/nomii/nomii-backup.log 2>&1') | crontab -"
#
# First run creates the backup dir and writes the first dump so you can
# verify before the cron ever fires. Installing the crontab after that
# one-shot ensures cron and the manual run match.
# ============================================================
set -e

BACKUP_DIR="${HOME}/db-backups"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-shenmay-db}"
DB_USER="${DB_USER:-shenmay}"
DB_NAME="${DB_NAME:-shenmay_ai}"

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d_%H%M%S)
OUT="${BACKUP_DIR}/shenmay_ai_${TS}.sql.gz"

# --no-owner + --no-privileges keep the dump portable across user names
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" --no-owner --no-privileges "$DB_NAME" \
  | gzip > "$OUT"

# Retain last N days. Glob both old and new prefixes so the one-time
# transition doesn't leave Phase-6-era backups behind forever.
find "$BACKUP_DIR" \( -name "shenmay_ai_*.sql.gz" -o -name "nomii_ai_*.sql.gz" \) -mtime +${RETAIN_DAYS} -delete

SIZE=$(du -sh "$OUT" | cut -f1)
COUNT=$(ls "$BACKUP_DIR"/shenmay_ai_*.sql.gz "$BACKUP_DIR"/nomii_ai_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
echo "$(date -Iseconds) ok: $(basename "$OUT") ${SIZE} | ${COUNT} backup(s) on disk"
