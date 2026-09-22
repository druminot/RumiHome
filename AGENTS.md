# RumiHome

Landing page + sistema de gestión de arriendo temporal para "Departamento Concepción" (rumihome.io), propiedad de Daniel Ruminot.

## Componentes

- **`landing/`** — página pública estática.
- **`app/`** — SPA React + Vite. Dos portales: `/admin` (anfitrión) y `/reserva` (huésped: ve su reserva y la clave de puerta).
- **`server/`** — API Node/Express sobre SQLite (volumen `/data`). Módulos: reservas, finanzas (gastos, supermercado, publicidad), smarthome (energía, llaves). Autenticación Firebase Auth (idToken verificado en middleware).
- **`agent/`** — asistente multi-agente para Telegram (ver abajo).
- **Backup continuo**: `litestream/` replica SQLite a GCS cada 10s; `scripts/` snapshots semanales y backup diario.

## Convenciones del negocio

- Todo en **español**. Dinero en **CLP**. Fechas **YYYY-MM-DD**.
- Las reservas nacen en estado `pendiente`; confirmar habilita la clave de puerta en el portal del huésped.
- Arriendo mínimo: 2 noches. `property_id=1` está hardcodeado (multi-propiedad pendiente).
- **Guard anti-fechas-pasadas**: `crear_reserva` rechaza check-in/check-out en el pasado o check-out ≤ check-in. El system prompt inyecta la fecha de hoy y exige verificar el año antes de llamar tools.
- Auth del agente: login Firebase admin una vez + refresh automático del idToken (~1h) en `agent/api_client.py` / `agent/auth.py`.
- LLM: `glm-5.3-flash` vía Ollama Cloud (endpoint OpenAI-compatible, `https://ollama.com/v1`).

## Arquitectura multi-agente

```
Texto libre ──► ROUTER (supervisor, sin tools de dominio)
                 │ clasifica intención y delega con tool de delegación
                 ├──► agente_reservas  (listar/crear/buscar/estado, stats, calendario)
                 ├──► agente_finanzas  (stats, calendario, neto del mes)
                 └──► agente_domotica  (energía, llaves, dispositivos)

/reservas, /stats ──► directo al sub-agente (sin pasar por el router)
```

- **Router** (`agent/router.py`): supervisor LangChain. No conoce la API; solo decide a quién delegar mediante tools `preguntar_reservas`, `preguntar_finanzas`, `preguntar_domotica`.
- **Sub-agentes** (`agent/agents/`): cada uno tiene su system prompt específico y SOLO sus tools (`agent/tools/`), extraídas del `tools.py` monolítico original.
- **Contexto** (`agent/main.py`): historial `history[-8:]` de Telegram.

### Regla de contexto (política vigente)

- Los 3 agentes actuales **COMPARTEN** el historial de conversación (`history[-8:]` se pasa igual al router y a los sub-agentes).
- Agentes futuros que impliquen **usuarios distintos al anfitrión** (ej. soporte a huéspedes) deben nacer **AISLADOS**: historial propio por chat, sin mezclar datos entre conversaciones.
- Cada agente declara en su módulo si comparte o no contexto.

## Estructura del agente

```
agent/
├── main.py          # Telegram: texto libre → router, /reservas /stats → sub-agente directo
├── router.py        # supervisor con tools de delegación
├── agents/          # sub-agentes con prompts específicos (reservas, finanzas, domotica)
├── tools/           # tools por dominio (reservas, finanzas, domotica)
├── api_client.py    # _get/_send + Firebase auth (compartido por todas las tools)
├── auth.py          # login/refresh Firebase
└── Dockerfile
```

## Deploy

`docker compose up -d --build` (en el servidor). El agente lee `/root/agent.env` (env_file): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `FIREBASE_EMAIL`, `FIREBASE_PASSWORD`, `OLLAMA_API_KEY`.

## Regla de permisos para el backlog

Cualquier agente IA (opencode u otro) que trabaje en este repo **NO debe iniciar ninguna tarea del backlog sin permiso explícito de Daniel**: pedir confirmación indicando la tarea específica y esperar su OK antes de escribir código para ella.

## Entorno RR (staging espejo + agentes dev aislados)

RumiHome tiene un segundo entorno tipo profesional para desarrollar features con agentes:

```
@devrumunotbot (Telegram, solo chat de Daniel)
   → opencode headless en /opt/rumihome-rr (branch rr)
   → agentes: pm · supervisor · ux · frontend · backend · qa
   → deploy staging: rumihome.io/rr/ (landing + app + api + DB copia)
   → Daniel revisa → "APROBAR" → scripts/promote.sh → PROD
```

### Roles y prompts de los agentes dev

- **pm** — **ROUTER del equipo**: clarifica la feature, aplica las reglas de ruteo (qué pasos aplican: ux/frontend/backend — queda escrito en `.rr/plan.md` sección `RUTEO`), descompone en tareas y NO codea. **Monitoreo rotativo cada 5 min**: revisa el trabajo de un agente, 5 min después otro, hasta dar la vuelta; también audita que el ruteo fue correcto; si detecta desviación avisa al supervisor.
  - Reglas de ruteo: solo UI → ux+frontend; solo API/datos → backend; UI+datos → ux+frontend+backend; cambio de estilo global → ux siempre primero; duda de alcance → pregunta a Daniel; QA siempre aplica.
- **supervisor** — SOLO audita que el grupo siga la línea del pedido. Si detecta desvío: crea `.rr/HALT` (todos los agentes se detienen al verlo), redacta informe y el bot lo envía a Daniel por Telegram. Solo Daniel levanta el HALT con `REANUDAR`.
- **ux** — genera spec de UI (`.rr/ux-<feature>.md`) desde `styles.css` (fuente de verdad del diseño) ANTES de codificar; revisión visual del staging DESPUÉS del deploy. Gate doble.
- **frontend** — implementa en `app/` siguiendo la spec UX; `npm run build` debe pasar.
- **backend** — implementa en `server/`; prueba contra el SQLite de staging; nunca toca litestream.yml ni auth sin plan.
- **qa** — build limpio, revisión de diff, pruebas funcionales; escribe veredicto GO/NO-GO en `.rr/qa-veredicto.md`. Solo con GO se deploya a staging.

### Reglas del entorno RR (TODOS los agentes dev)

1. **Aislamiento físico**: trabajan exclusivamente en `/opt/rumihome-rr` (branch `rr` o `rr/feature-*`). PROHIBIDO tocar `/opt/rumihome` (prod), la DB de prod, `litestream.yml` de prod, o las credenciales de los bots de gestión.
2. **Promoción**: `scripts/promote.sh` SOLO se ejecuta cuando Daniel escribe "APROBAR" al bot. Los agentes dev no pueden ejecutarlo ni hacer push a main.
3. **Rollback**: cada promoción deja tags `prod-<fecha>-pre` (estado previo) y `prod-<fecha>`, más backup del DB (`/root/backups/pre-promote-*.db`). `scripts/rollback.sh [--db] [tag]` restaura.
4. **Flujo de iteración**: QA NO-GO o `CAMBIOS: <texto>` → vuelve al equipo en el MISMO branch `rr/feature-*`.
5. Máx 3 iteraciones por tarea → escalar a Daniel.
6. Reset staging: el bot puede restaurar la DB staging desde `/root/backups/staging-seed.db` (snapshot de prod).

### Infra del staging

- Clone: `/opt/rumihome-rr` (branch `rr`), compose `docker-compose.rr.yml` → containers `rumihome-api-rr`, `rumihome-app-rr`, red `rumihome-rr`, DB bind-mount `./data/rumihome.db`.
- nginx (espejo completo):
  - `location = /rr/` → landing estática del espejo (`/opt/rumihome-rr/landing/index.html`), links parcheados a `/rr/app/reserva`
  - `location /rr/img/` → imágenes de la landing del espejo
  - `location /rr/app/` → app-rr (SPA; Vite base `VITE_BASE_PATH=/rr/app/`, rutas `VITE_ADMIN_PATH=/rr/app/admin`, `VITE_GUEST_PATH=/rr/app/reserva`)
  - `location /rr/api/` → api-rr
- Config opencode: `/root/.config/opencode-rr/` (opencode.json con provider glm-5.3-flash Ollama Cloud, `agent/*.md` con los prompts, `permissions.json` con bash allowlist que DENIEGA todo lo no listado; `external_directory: deny`, bloqueo `/root` y `/etc/nginx`). Allowlist incluye verificación determinista: `docker run --rm`, `docker compose *`, `cmp`, `sha256sum`, `wc`, `rm -rf /tmp/*`.
- Bot puente: servicio systemd `rumihome-dev-bot` (`agent-dev/`, venv en `/opt/rumihome-rr/agent-dev/.venv`), env `/root/dev-agent.env` (TELEGRAM_BOT_TOKEN_DEV, TELEGRAM_CHAT_ID_DEV, OLLAMA_API_KEY compartida). **FASE 2**: el puente es un **StateGraph LangGraph** (OSS, 100% en VPS):
  - `graph_flow.py` — grafo: `pm_plan → esperar_aprobar(interrupt APROBAR/CAMBIOS/CANCELAR) → ux? → Send(FE∥BE) → qa → deploy`; NO-GO itera vía `pm_cambios` (máx 3) → escalar.
  - `graph_flow_core.py` — cliente opencode server (sesiones por rol, reset por feature), parsers del plan, trazas locales, outbox thread-safe.
  - `main.py` — capa Telegram: invoca el grafo con `thread_id` por feature y drena la outbox a mensajes.
  - **SqliteSaver** (`agent-dev/flujo.db`): checkpoint tras cada paso → el flujo sobrevive reinicios del bot/VPS; retención (cron diario `/usr/local/bin/flujo-db-maint.sh`, purga >50MB conserva 10 threads).
  - **Protocolo de fallos del PM v2** dentro de cada paso: rc≠0 → PM diagnostica con ground truth → REINTENTO (instrucción corregida) → ESCALAR a Daniel. Jamás codea el PM.
  - **Trazas locales** `.rr/trace-<feature>.log` con rotación (máx 10) — sin LangSmith (nada fuera del VPS).
  - Salvaguardas recursos: cron semanal `docker builder prune --keep-storage 2GB` (`/etc/cron.d/rumihome-buildcache`) + retención flujo.db.

### Velocidad del pipeline (técnicas de la industria)

- **`opencode serve` persistente** (systemd `opencode-serve`, puerto 127.0.0.1:4096, password en unit): el bot invoca los agentes vía HTTP (`POST /session/:id/message`) con **sesión reutilizable por rol** → cero cold boot por paso (antes ~2-4 min × cada agente). Fallback automático a `opencode run` local si el server no responde.
- **Timeouts duros por rol** (seg): pm 480 · ux 720 · frontend 720 · backend 720 · qa 600. Un agente colgado NUNCA bloquea el flujo.
- **Paralelismo FE∥BE**: `Send` de LangGraph lanza frontend y backend en la misma superstep cuando el RUTEO pide ambos (ownership disjunto de archivos); QA siempre al final.
- **Prompts de arranque directo**: cada invocación referencia `.rr/plan.md` + spec y prohíbe re-analizar el problema o releer archivos que no tocará.
- **QA sin trampas**: qa.md prohíbe explorar `/root`/`~/.nvm` (bloqueado por diseño) y reintentar comandos rechazados; node solo vía containers (`node:22-alpine`).
- **PM v2** (pm.md): clasificación SIMPLE/MEDIA/COMPLEJA con escalamiento de esfuerzo, delegación con 4 campos (objetivo/entregable/límites/éxito), sección SUPUESTOS en plan.md, protocolo de fallos, monitoreo con ground truth, anti-anchoring en bugs.
- **Medición T3** (testimonios, sep 2026, grafo v2): **PM 126s** · total **1521s (~25min)** end-to-end — 2× más rápido que la medición pre-LangGraph (~49min), con progreso visible en Telegram y rollback limpio.

### Panel /code (rumihome.io/code) — control de versiones y despliegues

Página estilo GitHub: árbol de versiones (SVG, `app/src/pages/CodePanel.tsx`), MERGE→PROD y rollback desde la web. **La promoción ya NO va por el bot**: tras el deploy a staging, Daniel valida y hace MERGE en el panel.

- **Rutas client**: `BASE_URL + /code` (staging `/rr/app/code`, prod `/code`); **API**: `VITE_API_PATH` (staging `/rr/api`, prod `/api`) — endpoints en `server/src/routes/deployments.ts`.
- **Flujo de acciones**: POST solo **encola** en `/deploy-data/queue/` → executor host (`infra/deploy-bridge/`, systemd path unit) valida y corre `promote.sh`/`rollback.sh` → result en `results/`. El web/API jamás ejecutan git ni docker.
- **Seguridad en capas**: requireAdmin (Firebase) → nonce un-uso 5 min (máx 3) → validación de shape → guards de promote.sh (branch, HALT, healthcheck, auto-rollback, backup DB).
- **Datos**: `history.json` regenerado cada 1 min por `history.py` (git de ambos repos); staging monta `/var/lib/rumihome/deploy-dev` (executor `STAGING=1` dry-run), prod `/var/lib/rumihome/deploy` (real). Setup: `infra/deploy-bridge/SETUP.md`.
- **QA del panel**: checklist completo en `.opencode/QA-CODE-PANEL.md` — obligatorio para features que toquen el panel, sus endpoints o el bridge.
- **DATO_PEDIDO**: cualquier agente ejecutor (ux/fe/be/qa) que necesite un dato que solo Daniel conoce (correo de notificación, preferencia, texto exacto) escribe `.rr/dato-pedido.md` con `## DATO_PEDIDO` y termina su turno; el grafo se pausa, el bot pregunta por Telegram y la respuesta se re-inyecta al mismo agente. Prohibido inventar datos o placeholders; secretos van al env del servidor (Daniel los agrega), jamás al repo.

## Automatización con n8n

n8n corre en Docker en el VPS: `https://n8n.rumihome.io` (editor con auth propia de n8n, owner Daniel; webhooks `/webhook/*` públicos — cada workflow valida su propio token/secret). Infra versionada en `infra/n8n/` (docker-compose, nginx, backup.sh con export diario de workflows a `n8n/workflows/` → GitHub; runbook en `infra/n8n/SETUP.md`).

- **Regla para el equipo dev**: antes de rutear una feature, evaluar si es AUTOMATIZACIÓN (ver regla completa en pm.md): n8n gana para SaaS estándar / cron / notificaciones / reportes; código gana para lógica de negocio RumiHome; mixto = n8n orquesta y llama `/rr/api/...`.
- **Entregable [n8n]**: JSON del workflow en `n8n/workflows/` + instrucciones de importación. Daniel lo importa con 1 click y solo asigna credenciales/permisos.
- **PROHIBIDO para agentes dev**: acceder a la instancia n8n, su API, sus credenciales o su volumen. No existe API key de n8n para agentes.
- **Restauración desde cero**: clonar repo → `infra/n8n/SETUP.md` → importar `n8n/workflows/*.json` → re-ingresar credenciales a mano (secrets nunca en GitHub).

## Backlog / Tareas futuras

- [ ] **Soporte a huéspedes por Telegram** — agente AISLADO (política de contexto), acceso solo lectura a SU reserva por PNR + clave de puerta.
- [ ] **Notificaciones proactivas** — check-in/check-out del día al anfitrión (cron dentro del container o webhook).
- [ ] **Reportes PDF/mensuales** — neto, gastos por categoría, ocupación.
- [ ] **Multi-propiedad** — quitar `property_id=1` hardcodeado en tools y API.
- [ ] **Métricas por agente** — tokens consumidos y latencia por sub-agente (log estructurado).
- [ ] **Tests E2E** — flujos: crear reserva → confirmar → clave puerta → neto del mes.
- [ ] **Comando /domotica** — acceso directo al sub-agente domótica (hoy solo vía router).
- [ ] **Rate limiting / retry con backoff** en `api_client.py` para la API interna.