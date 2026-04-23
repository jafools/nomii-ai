#!/bin/bash
# ============================================================
# Shenmay AI — Backup Script
# Creates a timestamped, gzipped PostgreSQL dump.
# Run: bash scripts/backup.sh
# Optional: add to cron for automatic backups.
#
# Cron example (daily at 2am):
#   0 2 * * * /path/to/nomii-ai/scripts/backup.sh >> /var/log/nomii-backup.log 2>&1
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTAINER="${NOMII_DB_CONTAINER:-shenmay-db}"
DB_USER="${NOMII_DB_USER:-shenmay}"
DB_NAME="${NOMII_DB_NAME:-shenmay_ai}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Backup directory — override with BACKUP_DIR env var
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
# Number of backups to keep — override with BACKUP_RETAIN env var
BACKUP_RETAIN="${BACKUP_RETAIN:-7}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="nomii_backup_${TIMESTAMP}.sql.gz"
FILEPATH="$BACKUP_DIR/$FILENAME"

echo ""
echo "Shenmay AI — Backup"
echo "=================="
echo "Destination: $FILEPATH"
echo ""

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo -e "${RED}Error: ${CONTAINER} is not running.${NC}"
  exit 1
fi

# Dump and compress
echo -n "Dumping database... "
if docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILEPATH"; then
  SIZE=$(du -sh "$FILEPATH" | cut -f1)
  echo -e "${GREEN}done (${SIZE})${NC}"
else
  echo -e "${RED}FAILED${NC}"
  rm -f "$FILEPATH"
  exit 1
fi

# Prune old backups
echo -n "Pruning old backups (keeping last ${BACKUP_RETAIN})... "
OLD_COUNT=$(ls -t "$BACKUP_DIR"/nomii_backup_*.sql.gz 2>/dev/null | tail -n +$((BACKUP_RETAIN + 1)) | wc -l | tr -d ' ')
if [ "$OLD_COUNT" -gt 0 ]; then
  ls -t "$BACKUP_DIR"/nomii_backup_*.sql.gz | tail -n +$((BACKUP_RETAIN + 1)) | xargs rm -f
  echo -e "${YELLOW}removed ${OLD_COUNT} old backup(s)${NC}"
else
  echo "nothing to prune"
fi

echo ""
echo -e "${GREEN}✓ Backup complete: $FILENAME${NC}"
echo ""
echo "To restore this backup:"
echo "  gunzip -c $FILEPATH | docker exec -i $CONTAINER psql -U $DB_USER $DB_NAME"
echo ""
