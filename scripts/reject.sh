#!/bin/bash
# reject.sh — descarta los cambios pendientes de staging SIN tocar producción.
#
# Uso:
#   reject.sh            → archiva el estado actual de rr en un tag rejected-<fecha>
#                          y resetea rr a main (staging = prod de nuevo).
#   reject.sh <branch>   → además borra el branch rr-feature-* indicado.
#
# La promoción a prod se valida SOLO desde rumihome.io/code (decisión Daniel).
# Rechazar NUNCA toca /opt/rumihome.
set -euo pipefail

RR_DIR=/opt/rumihome-rr
DATE_TAG=$(date +%Y-%m-%d-%H%M)
BRANCH="${1:-}"

cd "$RR_DIR"
git fetch origin

CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "rr" ]; then
  echo "ERROR: /opt/rumihome-rr no está en branch rr (está en $CURRENT)" >&2
  exit 1
fi
if [ -f .rr/HALT ]; then
  echo "ERROR: .rr/HALT activo — rechazo bloqueado por el supervisor" >&2
  exit 1
fi

# 1. Archivar el estado rechazado (queda en GitHub como evidencia, no se pierde)
git tag "rejected-$DATE_TAG" HEAD 2>/dev/null || true
PUSH_URL=$(git -C "$RR_DIR" remote get-url origin 2>/dev/null || echo origin)
git push "$PUSH_URL" "rejected-$DATE_TAG" 2>/dev/null || echo "AVISO: push del tag rejected falló (sin red/credenciales) — continúa"
echo "Estado rechazado archivado: rejected-$DATE_TAG ($(git rev-parse --short HEAD))"

# 2. Resetear staging al estado de prod (main)
git checkout -q rr
git reset --hard origin/main
echo "Staging reseteado a origin/main ($(git rev-parse --short HEAD))"

# 3. Redesplegar staging con el código reseteado
docker compose -f docker-compose.rr.yml up -d --build > /tmp/reject-build.log 2>&1 || {
  echo "ERROR: build de staging falló. Revisa /tmp/reject-build.log" >&2
  exit 1
}

# 4. Limpiar artefactos del pipeline (plan, traces, marcadores, veredicto)
rm -f .rr/plan.md .rr/qa-veredicto.md .rr/dato-pedido.md .rr/alerta-supervisor.md 2>/dev/null || true
rm -f .rr/trace-*.log 2>/dev/null || true

# 5. Borrar el branch de la feature rechazada (opcional, explícito)
if [ -n "$BRANCH" ]; then
  case "$BRANCH" in
    rr-feature-*)
      git branch -D "$BRANCH" 2>/dev/null || echo "AVISO: branch $BRANCH no existía localmente"
      git push "$PUSH_URL" --delete "$BRANCH" 2>/dev/null || echo "AVISO: no se pudo borrar $BRANCH remoto (¿ya no existía?)"
      echo "Branch borrado: $BRANCH"
      ;;
    *)
      echo "ERROR: branch inválido (solo rr-feature-*): $BRANCH" >&2
      exit 1
      ;;
  esac
fi

echo "RECHAZO OK — staging = prod ($(git rev-parse --short HEAD)), archivo: rejected-$DATE_TAG"