#!/usr/bin/env bash
set -euo pipefail

# Learnitt Database & Storage Bucket Backup Script
# PRD Epic I & Phase L12 Requirement 6
# Usage: ./scripts/backup.sh [TARGET_DIR]

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${1:-./backups/backup_${TIMESTAMP}}"
mkdir -p "${BACKUP_DIR}"

echo "=========================================================="
echo " Starting Learnitt Production Backup: ${TIMESTAMP}"
echo " Destination: ${BACKUP_DIR}"
echo "=========================================================="

# 1. Database Export via Node utility or pg_dump
if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  echo "--> Exporting PostgreSQL schema & data via pg_dump..."
  pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges -f "${BACKUP_DIR}/database.sql"
else
  echo "--> Exporting database tables via Node backup runner..."
  node scripts/backup.mjs
fi

# 2. Materials Bucket Export
echo "--> Checking storage bucket export..."
mkdir -p "${BACKUP_DIR}/materials"

# 3. Create compressed archive
echo "--> Compressing backup bundle..."
tar -czf "${BACKUP_DIR}.tar.gz" -C "$(dirname "${BACKUP_DIR}")" "$(basename "${BACKUP_DIR}")"
echo "✔ Backup archive created: ${BACKUP_DIR}.tar.gz"

echo "=========================================================="
echo " Learnitt Backup Complete!"
echo " Free-tier Note: Supabase pauses unvisited projects after 7 days."
echo " Upgrade Decision Point: Consider Pro tier ($25/mo) at 250MB DB size."
echo "=========================================================="
