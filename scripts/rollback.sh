#!/bin/bash
# rollback.sh — vuelta atrás de prod a un tag prod-*.
# Uso:
#   rollback.sh                        → vuelve al tag prod-* ANTERIOR al actual
#   rollback.sh prod-2026-09-18-1234   → vuelve a un tag específico
#   rollback.sh --db prod-2026-09-18-1234  → además restaura el DB de esa fecha
set -euo pipefail

PROD_DIR=/opt/rumihome
BACKUP_DIR=/root/backups
RESTORE_DB=0

if [ "${1:-}" = "--db" ]; then
  RESTORE_DB=1
  shift
fi

TARGET="${1:-}"

cd "$PROD_DIR"

if [ -z "$TARGET" ]; then
  # tag actual y anterior
  CURRENT=$(git describe --tags --match 'prod-*' --abbrev=0 2>/dev/null || true)
  if [ -z "$CURRENT" ]; then
    echo "ERROR: no hay tags prod-*" >&2
    exit 1
  fi
  TARGET=$(git tag --sort=-creatordate --list 'prod-*' | grep -A1 "^$CURRENT$" | tail -1)
  if [ -z "$TARGET" ] || [ "$TARGET" = "$CURRENT" ]; then
    echo "ERROR: no encontré un tag anterior a $CURRENT" >&2
    exit 1
  fi
  echo "Actual: $CURRENT → Rollback a: $TARGET"
fi

git fetch origin --tags
git checkout -q main
git reset --hard "$TARGET"

# restaurar DB si piden
if [ "$RESTORE_DB" = "1" ]; then
  DATE_PART=$(echo "$TARGET" | sed 's/prod-//')
  DB_FILE=$(ls -t "$BACKUP_DIR"/pre-promote-$DATE_PART*.db "$BACKUP_DIR"/*"$DATE_PART"*.db 2>/dev/null | head -1 || true)
  if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
    echo "Restaurando DB desde $DB_FILE..."
    docker compose stop api > /dev/null 2>&1 || true
    docker run --rm -v rumihome_data:/data -v "$BACKUP_DIR":/backup alpine sh -c \
      "cp /backup/$(basename "$DB_FILE") /data/rumihome.db"
    docker compose start api > /dev/null 2>&1 || true
  else
    echo "AVISO: no encontré backup DB para $TARGET — solo se restaura el código" >&2
  fi
fi

echo "Rebuild prod..."
docker compose up -d --build > /tmp/rollback-build.log 2>&1

sleep 10
for check in "https://rumihome.io:200" "https://rumihome.io/admin:200"; do
  url="${check%:*}"; expected="${check##*:}"
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$url" || echo 000)
  [ "$code" != "$expected" ] && { echo "HEALTHCHECK FALLO tras rollback: $url → $code"; exit 1; }
done

echo "ROLLBACK OK — prod en $(git rev-parse --short HEAD) ($TARGET)"