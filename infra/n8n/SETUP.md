# n8n en rumihome.io

n8n corre en Docker en el VPS (root@187.127.53.98) detrás de nginx. **Todo lo necesario para reconstruir desde cero vive en este repo** (excepto secrets, que se re-ingresan a mano).

## Instalación desde cero (runbook)

1. **DNS** (Hostinger, manual — el dominio no es accesible vía API MCP):
   - Registro A: `n8n.rumihome.io` → IP del VPS
2. **Archivos**: copiar `docker-compose.yml` y `nginx-n8n.conf` al VPS.
   ```bash
   scp infra/n8n/docker-compose.yml root@VPS:/opt/rumihome-rr/infra/n8n/
   scp infra/n8n/nginx-n8n.conf root@VPS:/etc/nginx/sites-available/n8n
   ```
3. **Secret**: en el VPS, crear `/opt/rumihome-rr/infra/n8n/.env` (NUNCA en el repo):
   ```
   N8N_ENCRYPTION_KEY=<generar: openssl rand -base64 32>
   ```
4. **Cert TLS**: el server block usa el wildcard-path de rumihome.io. Si el subdominio no está cubierto:
   ```bash
   certbot --nginx -d n8n.rumihome.io
   ```
   y apuntar `ssl_certificate` al nuevo cert.
5. **Levantar**:
   ```bash
   cd /opt/rumihome-rr/infra/n8n && docker compose up -d
   ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/n8n && nginx -t && systemctl reload nginx
   ```
6. **Primer acceso**: `https://n8n.rumihome.io` → crear cuenta owner (Daniel). Auth propia de n8n; sin basic auth extra.
7. **Backup cron**: `0 4 * * * /opt/rumihome-rr/infra/n8n/backup.sh` (tar a /root/backups/ + export JSON de workflows a `n8n/workflows/` → commit a GitHub).
8. **Restaurar workflows**: importar `n8n/workflows/*.json` desde la UI (Import from file). Credenciales (Telegram token, etc.) se re-ingresan a mano — nunca en GitHub.

## Reglas

- **Secrets** (N8N_ENCRYPTION_KEY, tokens de credenciales): solo en VPS / volumen `/opt/n8n`. Jamás en el repo.
- **Agentes dev**: no tocan n8n ni su API. Entregan workflows como JSON en `n8n/workflows/`; Daniel los importa con 1 click y solo configura permisos/credenciales.
- **Webhooks** (`/webhook/*`): públicos, cada workflow valida su propio token/secret. Todo lo demás pasa por la auth del editor.