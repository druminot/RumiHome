# Plan: GET /api/analytics/expense-ranking (ranking de gastos por categoría del último mes)

## Orden de Daniel (escenario 2)
Agregar un endpoint **GET /api/analytics/expense-ranking** que devuelva el ranking de
gastos **por categoría** del **último mes**, ordenado de mayor a menor, con total por
categoría y porcentaje del gasto. **Solo API — nada de UI.**

## Alcance
- **SÍ**: nuevo endpoint en `server/` (ruta + función DB de analytics sobre la tabla `expenses`).
- **NO**: UI (`app/`, `landing/`), agentes, `scripts/`, compose, nginx, litestream, credenciales.

## Semántica del endpoint (definición PM)
- `GET /api/analytics/expense-ranking` (montado bajo `requireAdmin` como el resto de `/api`, ver `server/src/index.ts:26` — mismo padrón que `/api/analytics/finance`).
- Query params:
  - `month` (YYYY-MM, opcional): mes a analizar. **Default = último mes calendario** (ej. hoy 2026-09-19 → `2026-08`). Rechaza formato inválido con 400 (mismo `^\\d{4}-\\d{2}$` de `/analytics/finance`).
  - `property_id` (opcional, default `1` por convención del repo).
- Fuente de datos: tabla `expenses` (gastos generales con categoría). **No** incluye supermercado ni publicidad (sus items no tienen categoría).
- Cálculo: `GROUP BY category`, `SUM(amount)` por categoría.
  - `total`: suma por categoría (CLP, entero).
  - `percentage`: `total_categoria / total_mes * 100`, redondeado a 1 decimal.
- **Orden**: total de mayor a menor. Solo se incluyen categorías con gasto > 0. Sin gastos → `ranking` vacío.
- Respuesta:
  ```json
  {
    "month": "2026-08",
    "property_id": 1,
    "total_expenses": 250000,
    "ranking": [
      { "category": "servicios",  "total": 120000, "percentage": 48.0 },
      { "category": "comision",   "total": 80000,  "percentage": 32.0 },
      { "category": "mantencion", "total": 50000,  "percentage": 20.0 }
    ]
  }
  ```

## RUTEO
- pm: APLICA — redacta este plan y descompone tareas (no codea).
- supervisor: APLICA — audita alcance: solo `server/`, sin tocar UI/infra/DB prod.
- ux: NO APLICA — no hay UI que diseñar ni revisar (orden explícita "nada de UI").
- frontend: NO APLICA — no hay UI.
- backend: APLICA — implementa función DB + ruta y prueba contra SQLite de staging.
- qa: APLICA — build limpio, revisión de diff (alcance solo `server/`), prueba funcional, veredicto en `.rr/qa-veredicto.md`.

## TAREAS
1. [backend] Implementar función DB `getExpenseRanking(month, propertyId)` en `server/src/db/finance.ts`
   - Junto a `getFinanceSummary` (bloque "Analytics mensuales"). Reutiliza el cálculo de `from`/`to` del mes (mismo padrón `{month}-01` → inicio del mes siguiente).
   - SQL: `SELECT category, SUM(amount) AS total FROM expenses WHERE expense_date >= ? AND expense_date < ? [AND property_id = ?] GROUP BY category ORDER BY total DESC`.
   - Devuelve: `{ month, ranking: [{ category, total, percentage }], total_expenses }`.
   - Criterios: `npm run build` y `npm run typecheck` pasan en `server/`.
   - Estado: listo — implementado; build + typecheck OK en node:22-alpine.
2. [backend] Registrar ruta en `server/src/routes/finance.ts`
   - `GET /analytics/expense-ranking` en el bloque "Analytics (Dashboard)", junto a `/analytics/finance`.
   - Valida `month` (default último mes calendario), `property_id` opcional; 400 con "Mes inválido" si aplica.
   - Criterios: endpoint responde 200 con el shape definido; 400 con month inválido.
   - Estado: listo — ruta registrada; default month = último mes calendario, default property_id = 1.
3. [backend] Prueba funcional contra SQLite de staging
   - Levantar o usar la API staging (`docker-compose.rr.yml`, container `rumihome-api-rr`, DB `./data/rumihome.db`).
   - Insertar gastos de prueba en varias categorías del mes→ validar: orden desc, totales correctos, `percentage` suma ≈ 100%, filter `property_id`, mes vacío → `ranking: []`, month inválido → 400.
   - Estado: listo — validado en copia temporal de la DB staging; se corrigió bug en el cálculo de `to` (over-shift de mes). Detalle en adenda abajo.
4. [qa] Validación final
   - Criterios: `git diff origin/rr..HEAD --name-only` limitado a `server/*` (y `.rr/*`); build limpio; pruebas funcionales del paso 3 OK; veredicto GO/NO-GO en `.rr/qa-veredicto.md`.
   - Estado: pendiente
5. [pm] Confirmar alcance restringido (sin UI ni infra) y cerrar iteración con el resultado al supervisor
   - Estado: pendiente

## DESVIACIONES (historial)
- Iteración 3: Daniel revirtió estética 90s (landing + SPA); la infra `/rr/` no se revierte.
- Escenario 2 (esta iteración): feature nueva **solo backend**, sin UI. Scope explícito: solo `server/` + docs `.rr/`.

## ADENDA BACKEND (2026-09-19)
- Implementado `getExpenseRanking(month, propertyId)` en `server/src/db/finance.ts` (bloque "Analytics mensuales") y ruta `GET /api/analytics/expense-ranking` en `server/src/routes/finance.ts` junto a `/analytics/finance`.
- Build + typecheck OK (node:22-alpine, mismo runtime del Dockerfile).
- Prueba funcional (copia temporal de la DB staging, modo dev-password):
  - Default (hoy 2026-09-19 → month 2026-08, prop1): servicios 135000 (50.9%), comision 80000 (30.2%), mantencion 50000 (18.9%), total 265000; % suman 100.0; orden desc.
  - `?property_id=2` filtra correctamente (solo otro 9999 → 100%).
  - Mes sin gastos → `ranking: []`, `total_expenses: 0`.
  - `?month=2026-8` (formato inválido) → 400 "Mes inválido"; sin auth → 401.
  - Nota: `month=2026-13` es aceptado por el regex `^\d{4}-\d{2}$` (mismo comportamiento de `/analytics/finance`; valida formato, no rango de mes). Se conserva el padrón existente.
- **Bug corregido durante prueba**: el cálculo de `to` del mes usaba `Number(month.slice(5)) + 1`, que con el mes "08" quedaba índice 9 = octubre (incluía gastos del mes siguiente). Corregido a sin `+1` (`Date.UTC(year, monthIndex, 1)`); re-build + re-prueba OK.
- Pendiente QA (tarea 4) y confirmación PM (tarea 5). No se rebuilda/deploya el container staging hasta QA GO.