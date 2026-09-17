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

- **pm** — clarifica la feature, la descompone en tareas (`.rr/plan.md`), NO codea. **Monitoreo rotativo cada 5 min**: revisa el trabajo de un agente, 5 min después otro, hasta dar la vuelta; si detecta desviación avisa al supervisor.
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
- nginx: `location /rr/` → app-rr (Vite base `/rr/`), `location /rr/api/` → api-rr.
- Config opencode: `/root/.config/opencode-rr/` (opencode.json con provider glm-5.3-flash Ollama Cloud, `agent/*.md` con los prompts, `permissions.json` con bash allowlist que DENIEGA todo lo no listado).
- Bot puente: container `agent-dev` (`agent-dev/`), env `/root/dev-agent.env` (TELEGRAM_BOT_TOKEN_DEV, TELEGRAM_CHAT_ID_DEV, OLLAMA_API_KEY compartida).

## Backlog / Tareas futuras

- [ ] **Soporte a huéspedes por Telegram** — agente AISLADO (política de contexto), acceso solo lectura a SU reserva por PNR + clave de puerta.
- [ ] **Notificaciones proactivas** — check-in/check-out del día al anfitrión (cron dentro del container o webhook).
- [ ] **Reportes PDF/mensuales** — neto, gastos por categoría, ocupación.
- [ ] **Multi-propiedad** — quitar `property_id=1` hardcodeado en tools y API.
- [ ] **Métricas por agente** — tokens consumidos y latencia por sub-agente (log estructurado).
- [ ] **Tests E2E** — flujos: crear reserva → confirmar → clave puerta → neto del mes.
- [ ] **Comando /domotica** — acceso directo al sub-agente domótica (hoy solo vía router).
- [ ] **Rate limiting / retry con backoff** en `api_client.py` para la API interna.