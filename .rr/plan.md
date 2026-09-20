# Plan: Endpoint GET /api/analytics/expense-ranking

## Orden de Daniel
Agregar endpoint `GET /api/analytics/expense-ranking`: ranking de gastos por
categoría del último mes, ordenado de mayor a menor, con total por categoría y
porcentaje del gasto. Solo API - nada de UI.

Branch de trabajo: `rr-t2-ranking` (ya existe, árbol limpio en `1bdb068`; NO
crear branch nuevo). Staging disponible para QA: `rumihome-api-rr`.

## RUTEO
Regla aplicada: solo API/datos sin cambio visual → backend; QA siempre.
- ux: NO APLICA — feature explícitamente "Solo API - nada de UI"; sin cambio visual.
- frontend: NO APLICA — nada que consumir en la UI; no se toca `app/` ni `landing/`.
- backend: APLICA — función de ranking nueva en `server/src/db/finance.ts` + ruta nueva en `server/src/routes/finance.ts` (montada en `/api` junto a `/analytics/finance`).
- qa: APLICA — build + prueba funcional contra staging + veredicto GO/NO-GO.

SUPUESTOS (decisiones de alcance tomadas, sin bloquear a Daniel):
1. "Último mes" = mes calendario ANTERIOR al actual (hoy 2026-09-20 → 2026-08),
   valor por defecto del endpoint; acepta `?month=YYYY-MM` opcional (mismo
   patrón que `/analytics/finance`).
2. "Gastos por categoría" = tabla `expenses` (categorías: servicios, mantencion,
   comision, insumos, otro), consistente con `expenses_by_category` de
   `getFinanceSummary`. Supermercado y publicidad quedan FUERA: no tienen
   categoría en el mismo esquema (productos / plataformas).
3. `property_id` opcional con default 1 (convención del negocio: property_id=1
   hardcodeado); filtrable vía query.
4. `percentage` redondeado a 1 decimal, base = suma de las categorías del mes;
   solo categorías con gasto > 0; orden DESC por total.

## TAREAS
1. [backend] Ranking de gastos por categoria (API)
   - Criterios: en `server/src/db/finance.ts` agregar tipos
     `ExpenseRankingEntry {category,total,percentage}` y
     `ExpenseRanking {month,total_expenses,ranking}` + función
     `getExpenseRanking(month, propertyId?)`: `from = ${month}-01`, `to` =
     primer día del mes siguiente (mismo patrón que `getFinanceSummary`);
     query `SELECT category, SUM(amount) AS total FROM expenses WHERE
     expense_date >= ? AND expense_date < ? [AND property_id = ?] GROUP BY
     category ORDER BY total DESC`; `total_expenses` = suma de totales;
     `percentage` = `Math.round((total/total_expenses)*1000)/10`, 0 si no hay
     gastos. En `server/src/routes/finance.ts` importar `getExpenseRanking` y
     agregar `financeRouter.get('/analytics/expense-ranking', ...)`: month por
     defecto = mes calendario anterior; validar `?month` con `/^\d{4}-\d{2}$/`
     → 400 `{error:'Mes inválido'}`; `?property_id` default 1; respuesta 200
     `{month, property_id, total_expenses, ranking}`. `npm run typecheck` en
     `server/` pasa sin errores. No tocar `app/`, `landing/`, otros routers ni auth.
   - Estado: hecha
2. [qa] Veredicto endpoint expense-ranking
   - Criterios: `npm run build` en `server/` pasa limpio; diff limitado a
     `server/src/db/finance.ts` y `server/src/routes/finance.ts` (sin UI);
     prueba funcional contra `rumihome-api-rr` con curl: sin params → mes
     2026-08, ranking DESC, porcentajes suman ≈100 (1 decimal); `?month=2026-08`
     consistente; `?month=invalido` → 400; `?property_id=1` OK; shape
     `{month, property_id, total_expenses, ranking:[{category,total,percentage}]}`
     con solo categorías de gasto > 0; veredicto GO/NO-GO escrito en
     `.rr/qa-veredicto.md`.
   - Estado: pendiente

## DESVIACIONES
(ninguna)