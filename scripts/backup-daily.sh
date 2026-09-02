#!/bin/bash
# Dump diario del DB de Rumihome a GCS (retención 90 días vía lifecycle)
set -euo pipefail
TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
DB_VOLUME=$(docker volume inspect rumihome_data --format '{{.Mountpoint}}')
TMP=/tmp/rumihome-backup-$TIMESTAMP.db

# Backup consistente con sqlite3 del contenedor api (volumen compartido)
docker run --rm -v rumihome_data:/data -v /tmp:/out alpine:3.20 \
  sh -c "apk add -q sqlite >/dev/null 2>&1 && sqlite3 /data/rumihome.db '.backup /out/backup.db'"

mv /tmp/backup.db "$TMP"
gzip -f "$TMP"

# Subir a GCS con la SA backup-agent
GOOGLE_APPLICATION_CREDENTIALS=/root/backup-sa.json \
  gcloud storage cp "$TMP.gz" "gs://rumihome-backups-rumihome-448217/dumps/rumihome-$TIMESTAMP.db.gz" 2>&1 | tail -1

rm -f "$TMP.gz"
echo "backup subido: dumps/rumihome-$TIMESTAMP.db.gz"
