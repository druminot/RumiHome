#!/bin/bash
# promote.sh — promoción rr → main → prod con healthcheck y rollback automático.
# SOLO debe ejecutarlo el puente de Telegram cuando Daniel escribe "APROBAR".
# Los agentes dev NO tienen permiso para ejecutarlo (guard en permisos opencode).
set -euo pipefail

PROD_DIR=/opt/rumihome
RR_DIR=/opt/rumihome-rr
BACKUP_DIR=/root/backups
DATE_TAG=$(date +%Y-%m-%d-%H%M)

cd "$RR_DIR"
git fetch origin

# 0. Verificaciones previas
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "rr" ]; then
  echo "ERROR: /opt/rumihome-rr no está en branch rr (está en $CURRENT_BRANCH)" >&2
  exit 1
fi
if [ -f .rr/HALT ]; then
  echo "ERROR: .rr/HALT activo — promoción bloqueada por el supervisor" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: hay cambios sin commitear en rr" >&2
  exit 1
fi

# 1. Tag de rollback en el estado actual de prod
cd "$PROD_DIR"
PREV_TAG=$(git describe --tags --match 'prod-*' --abbrev=0 2>/dev/null || echo "ninguno")
git tag "prod-$DATE_TAG-pre" && git push origin "prod-$DATE_TAG-pre" 2>/dev/null || true
echo "Tag de rollback: prod-$DATE_TAG-pre (anterior: $PREV_TAG)"

# 2. Backup DB prod
mkdir -p "$BACKUP_DIR"
docker run --rm -v rumihome_data:/data -v "$BACKUP_DIR":/backup alpine sh -c \
  "apk add --quiet sqlite >/dev/null 2>&1 && sqlite3 /data/rumihome.db \".backup /backup/pre-promote-$DATE_TAG.db\""
echo "Backup DB: $BACKUP_DIR/pre-promote-$DATE_TAG.db"

# 3. Merge rr → main
cd "$PROD_DIR"
git checkout -q main
git pull --ff-only origin main
if ! git merge --no-ff "origin/rr" -m "Promote rr→main $DATE_TAG: $(git -C "$RR_DIR" log -1 --format=%s origin/rr)"; then
  echo "ERROR: conflicto en merge. ABORTANDO sin tocar prod." >&2
  git merge --abort 2>/dev/null || true
  exit 1
fi

# 4. Build + deploy prod
if ! docker compose up -d --build > /tmp/promote-build.log 2>&1; then
  echo "ERROR: build prod falló. Rollback de código..."
  git reset --hard "prod-$DATE_TAG-pre"
  docker compose up -d --build >> /tmp/promote-build.log 2>&1 || true
  exit 1
fi

# 5. Healthcheck
sleep 10
HEALTH_OK=1
for check in "https://rumihome.io:200" "https://rumihome.io/admin:200" "https://rumihome.io/api/reservations:401"; do
  url="${check%:*}"; expected="${check##*:}"
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$url" || echo 000)
  if [ "$code" != "$expected" ]; then
    echo "HEALTHCHECK FALLO: $url → $code (esperaba $expected)"
    HEALTH_OK=0
    break
  fi
done

if [ "$HEALTH_OK" != "1" ]; then
  echo "Rollback automático a $PREV_TAG..."
  git reset --hard "prod-$DATE_TAG-pre"
  docker compose up -d --build >> /tmp/promote-build.log 2>&1 || true
  echo "PROD restaurada al estado anterior. Revisa /tmp/promote-build.log"
  exit 1
fi

# 6. Push + tag final
git push origin main
git tag "prod-$DATE_TAG" && git push origin "prod-$DATE_TAG" 2>/dev/null || true
SHA=$(git rev-parse --short HEAD)
echo "PROMOTE OK — prod en $SHA (tag prod-$DATE_TAG, rollback: prod-$DATE_TAG-pre / $PREV_TAG)"