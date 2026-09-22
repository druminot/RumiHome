# deploy-bridge — infra del panel /code

Puente seguro entre la web `rumihome.io/code` y las acciones de prod
(promote.sh / rollback.sh). **La web nunca ejecuta nada**: encola peticiones
validadas; el executor (host, systemd .path) las procesa.

```
API server (Docker, rw SOLO en /var/lib/rumihome/deploy)
   ├── GET history  → lee history.json (regenerado cada 1 min por history.py)
   ├── POST promote/rollback → escribe queue/<id>.json (tras auth+nonce)
   └── GET status   → lee results/*.result.json
        ▼ systemd .path (instantáneo)
   executor.py (host root) → valida shape → scripts/promote.sh|rollback.sh → result
```

## Instalación PROD (host, una vez, tras promote del código)

```bash
mkdir -p /var/lib/rumihome/deploy/{queue,results}
cp /opt/rumihome/infra/deploy-bridge/{history.py,executor.py} /opt/rumihome/infra/deploy-bridge/
cp /opt/rumihome/infra/deploy-bridge/rumihome-deploy-{exec.path,exec.service,history.service,history.timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rumihome-deploy-history.timer rumihome-deploy-exec.path
```

El compose de prod monta el dir en el server: `/var/lib/rumihome/deploy:/deploy-data` (ver docker-compose.yml).

## Instalación STAGING (dev, para QA del pipeline)

```bash
mkdir -p /var/lib/rumihome/deploy-dev/{queue,results}
systemctl set-property rumihome-deploy-exec.service 2>/dev/null || true
# units con override apuntando a staging:
mkdir -p /etc/systemd/system/rumihome-deploy-exec.service.d
cat > /etc/systemd/system/rumihome-deploy-exec.service.d/staging.conf <<'EOF'
[Service]
Environment=DEPLOY_DIR=/var/lib/rumihome/deploy-dev
Environment=STAGING=1
EOF
cp /opt/rumihome/infra/deploy-bridge/rumihome-deploy-{history.service,history.timer} /etc/systemd/system/
# segundo timer para dev:
sed 's/rumihome-deploy-history/rumihome-deploy-history-dev/g' \
  /opt/rumihome/infra/deploy-bridge/rumihome-deploy-history.service > /etc/systemd/system/rumihome-deploy-history-dev.service
cat > /etc/systemd/system/rumihome-deploy-history-dev.service.d/staging.conf <<'EOF'
[Service]
Environment=DEPLOY_DIR=/var/lib/rumihome/deploy-dev
Environment=MAIN_REPO=/opt/rumihome-rr
Environment=RR_REPO=/opt/rumihome-rr
EOF
cat > /etc/systemd/system/rumihome-deploy-history-dev.timer <<'EOF'
[Unit]
Description=RumiHome deploy-bridge dev: history cada minuto

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now rumihome-deploy-history-dev.timer rumihome-deploy-history.timer rumihome-deploy-exec.path
```

## Seguridad

- El dir de datos es lo ÚNICO que monta el server API (rw). Sin git, sin repos, sin secretos.
- executor revalida: acción ∈ {promote, rollback}, tag regex `^prod-[a-z0-9][a-z0-9-]*$` (tags reales: `-HHMM`, `-base`, `-final`, `pre-*`), promote sin restore_db.
- promote.sh/rollback.sh ya protegen: branch guard, HALT, dirty tree, healthcheck + auto-rollback, DB backup pre-promote.
- Lock file evita promotes/rollbacks concurrentes.
- STAGING=1 = dry-run (solo escribe result sin ejecutar).

## Restauración desde cero

Clonar repo → correr las dos secciones de instalación de arriba. Units y scripts viven en este directorio (versionados en GitHub).