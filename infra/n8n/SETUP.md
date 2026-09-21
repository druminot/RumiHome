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
   N8N_INSTANCE_AI_MODEL_API_KEY=<OLLAMA_API_KEY, la misma de /root/dev-agent.env>
   N8N_SANDBOX_SERVICE_API_KEY=<generar: openssl rand -hex 24>
   SANDBOX_API_RUNNER_REGISTRATION_TOKEN=<generar: openssl rand -hex 24>
   SANDBOX_API_RUNNER_API_KEY=<generar: openssl rand -hex 24>
   N8N_RUNNERS_AUTH_TOKEN=<generar: openssl rand -hex 24>
   SEARXNG_SECRET=<generar: openssl rand -hex 24>
   N8N_SANDBOX_VERSION=<última service/ de https://github.com/n8n-io/n8n-sandbox-service/releases>
   ```
4. **AI Assistant (Instance AI)**: configurado por env (modelo `glm-5.3-flash` vía `https://ollama.com/v1`, endpoint OpenAI Responses `/v1/responses` que Ollama Cloud soporta nativamente). Sin licencia n8n, sin proxy. Sandbox self-hosted (`sandbox-certs` + `sandbox-api` + `sandbox-runner-1` privileged DinD — nunca exponer puertos) + web search vía SearXNG local incluidos en el compose. Si se quiere otro modelo: cambiar `N8N_INSTANCE_AI_MODEL` y recrear.
5. **Cert TLS**: el server block usa el cert dedicado `n8n.rumihome.io`. Si no existe:
   ```bash
   certbot certonly --nginx -d n8n.rumihome.io
   ```
5. **Levantar**:
   ```bash
   cd /opt/rumihome-rr/infra/n8n && docker compose up -d
   ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/n8n && nginx -t && systemctl reload nginx
   ```
7. **Primer acceso**: `https://n8n.rumihome.io` → crear cuenta owner (Daniel). Auth propia de n8n; sin basic auth extra.
8. **Backup cron**: `0 4 * * * /opt/rumihome-rr/infra/n8n/backup.sh` (tar a /root/backups/ + export JSON de workflows a `n8n/workflows/` → commit a GitHub).
9. **Restaurar workflows**: importar `n8n/workflows/*.json` desde la UI (Import from file). Credenciales (Telegram token, etc.) se re-ingresan a mano — nunca en GitHub.

## Reglas

- **Secrets** (N8N_ENCRYPTION_KEY, tokens de credenciales): solo en VPS / volumen `/opt/n8n`. Jamás en el repo.
- **Agentes dev**: no tocan n8n ni su API. Entregan workflows como JSON en `n8n/workflows/`; Daniel los importa con 1 click y solo configura permisos/credenciales.
- **Webhooks** (`/webhook/*`): públicos, cada workflow valida su propio token/secret. Todo lo demás pasa por la auth del editor.