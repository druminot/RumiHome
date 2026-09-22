# QA — criterios de aceptación del panel /code

Checklist obligatorio para cualquier feature que toque `app/src/pages/CodePanel.tsx`,
`server/src/routes/deployments.ts` o `infra/deploy-bridge/`. El agente `qa` debe
ejecutar TODOS los checks aplicables antes de dar GO.

## Endpoints (curl, con idToken Firebase del admin)

| # | Test | Esperado |
|---|---|---|
| 1 | `GET /rr/api/deployments/history` sin token | 401 |
| 2 | `GET /rr/api/deployments/history` con token | 200 + shape: `prod{sha,tag}`, `tags[{tag,commit_count,commits[{sha,msg,author,files,total_add,total_del}]}]`, `staging{branch,sha,ahead,ahead_count}`, `branches[{name,sha,date,ahead_of_rr}]` |
| 3 | `GET /rr/api/deployments/nonce` | `{nonce: 64hex, ttl_seconds: 300}` |
| 4 | `GET nonce` ×4 seguidos | 4º → **429** (máx 3 activos, TTL 5 min) |
| 5 | `GET /rr/api/deployments/status/xxx-invalido` | 400 |
| 6 | `POST promote` sin nonce | 403 |
| 7 | `POST promote` con nonce válido | 202 `{id}` → `GET status/:id` → `ok:true, dry_run:true` |
| 8 | `POST promote` reusando el nonce | 403 |
| 9 | `POST rollback {nonce, tag:"prod-2026-09-18-base", restore_db:true}` | 202 → result `dry_run:true` |
| 10 | `POST rollback {nonce, tag:"prod-HACK"}` | 400 (regex `^prod-[a-z0-9][a-z0-9-]*$`) |
| 11 | `POST rollback {nonce}` sin tag | 202 (vuelve al tag anterior) |

## Executor / infra (staging: `/var/lib/rumihome/deploy-dev`)

- `systemctl is-active rumihome-deploy-history-dev.timer` → active; `history.json` con frescura <120s
- `systemctl is-active rumihome-deploy-exec-dev.path` → active
- Peticiones en `queue/` → `results/` en <5s (path unit instantáneo)
- En staging TODOS los results llevan `"dry_run": true` — jamás tocan prod
- Limpieza post-QA: borrar `results/*.result.json` de pruebas

## Frontend (browser real)

- Login inline en `/rr/app/code` (staging) — NUNCA redirige a /admin
- Token expirado → refresh automático (getIdToken(true)) sin volver al login
- Árbol: línea prod verde con tags conectados; features (azul) nacen del nodo activo (anillo animado); staging ámbar SOLO si ahead_count>0 + flecha MERGE punteada
- Commit expandible muestra author, archivos ±líneas
- Sin pendientes: sin sección "Cambios del agente" ni botón MERGE
- Responsive ~500px: columnas se apilan, árbol legible
- `npm run build` limpio; bundle del container contiene "Árbol de versiones"

## Contratos fijos (no negociables)

- `API_BASE`: staging `/rr/api` (VITE_API_PATH en compose), prod `/api` (default)
- Ruta client: `BASE_URL` + `/code` (staging `/rr/app/code`, prod `/code`)
- Los POST **jamás ejecutan**: solo escriben `queue/deploy-<id>.json` con shape estricto; el executor del host revalida
- El API solo monta `/deploy-data` — sin git, sin repos, sin secretos