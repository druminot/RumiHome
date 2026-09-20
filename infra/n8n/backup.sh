#!/bin/bash
# Backup diario n8n: tar del volumen -> /root/backups/ + export de workflows a JSON -> GitHub
# Cron: 0 4 * * * /opt/rumihome-rr/infra/n8n/backup.sh
set -e
DATE=$(date +%Y%m%d)
RR=/opt/rumihome-rr
BACKUP_DIR=/root/backups
mkdir -p "$BACKUP_DIR" "$RR/n8n/workflows"

# 1) Tar del volumen (incluye DB SQLite con credenciales cifradas; NUNCA se sube a GitHub)
tar -czf "$BACKUP_DIR/n8n-volume-$DATE.tar.gz" -C /opt n8n 2>/dev/null
find "$BACKUP_DIR" -name "n8n-volume-*.tar.gz" -mtime +14 -delete

# 2) Export de workflows a JSON (CLI interno, sin API key) -> versionado en GitHub
docker exec rumihome-n8n sh -c 'n8n export:workflow --backup --output=/home/node/.n8n/export/' 2>/dev/null || true
if [ -d /opt/n8n/export ] && ls /opt/n8n/export/*.json >/dev/null 2>&1; then
  rm -f "$RR"/n8n/workflows/*.json
  cp /opt/n8n/export/*.json "$RR/n8n/workflows/"
  cd "$RR"
  if [ -n "$(git status --porcelain n8n/)" ]; then
    git add n8n/workflows/
    git -c user.name=rumihome-backup -c user.email=backup@rumihome.io \
      commit -m "chore(n8n): sync workflows desde backup diario ($(date +%F))"
    git push origin main
  fi
fi
echo "[$(date)] backup n8n OK"