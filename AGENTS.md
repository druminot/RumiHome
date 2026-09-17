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

## Backlog / Tareas futuras

- [ ] **Soporte a huéspedes por Telegram** — agente AISLADO (política de contexto), acceso solo lectura a SU reserva por PNR + clave de puerta.
- [ ] **Notificaciones proactivas** — check-in/check-out del día al anfitrión (cron dentro del container o webhook).
- [ ] **Reportes PDF/mensuales** — neto, gastos por categoría, ocupación.
- [ ] **Multi-propiedad** — quitar `property_id=1` hardcodeado en tools y API.
- [ ] **Métricas por agente** — tokens consumidos y latencia por sub-agente (log estructurado).
- [ ] **Tests E2E** — flujos: crear reserva → confirmar → clave puerta → neto del mes.
- [ ] **Comando /domotica** — acceso directo al sub-agente domótica (hoy solo vía router).
- [ ] **Rate limiting / retry con backoff** en `api_client.py` para la API interna.