# QA Notas — Modo oscuro admin (rama `rr-t1-modo-oscuro`, commit `4f1449f`)

**Fecha:** 2026-09-20
**Rol:** QA (validación pre-deploy)

## 1. Estado inicial
- Branch: `rr-t1-modo-oscuro`, HEAD `4f1449f rr(frontend): modo oscuro admin`.
- Sin `.rr/HALT`. Working tree limpio.
- Padre real del commit: `c9009ec` (plan.md declaraba base `b9d0d2e`; `c9009ec` es descendiente directo con los agents opencode — nota informativa, no bloqueante).

## 2. Build limpio (docker node:22-alpine)
- **app/**: `docker run --rm -v /opt/rumihome-rr/app:/build -w /build node:22-alpine sh -c "rm -rf dist && npm run build"` → `tsc -b && vite build` **OK** (57 módulos, 2.42s). Dist generado: `index-bMoZP7Ic.css` (21.52 kB), `index-BGEjo-Xg.js` (400.06 kB).
  - Único warning: chunk de firebase (dynamic vs static import) — **pre-existente**, ajeno a la feature.
- **server/**: mismo método sobre `server/` → `tsc` **OK** (sin errores; sin cambios de código en esta feature, smoke de build).
- Árbol git quedó limpio tras los builds (`dist/` gitignoreado); `tsconfig.tsbuildinfo` no cambió contenido.

## 3. Alcance del diff (`git diff --name-only 4f1449f~1 4f1449f`)
Solo `app/` + docs `.rr/`:
- `.rr/plan.md`, `.rr/ux-modo-oscuro.md` (docs)
- `app/index.html` (script anti-FOUC)
- `app/src/components/ThemeToggle.tsx` (nuevo)
- `app/src/hooks/useTheme.ts` (nuevo)
- `app/src/pages/AdminLogin.tsx`, `AdminDashboard.tsx`, `DashboardTab.tsx`
- `app/src/styles.css`
- `app/tsconfig.tsbuildinfo` (artefacto de build ya versionado — se mantiene la **observación menor** de features previas: debería estar en `.gitignore`, no bloquea)

Cero cambios en `server/`, `agent/`, `landing/`, `scripts/`, compose, nginx, DB.

## 4. Sin dependencias nuevas
- `app/package.json` + `package-lock.json` y `server/*` **sin cambios** en el diff. Firewall: 4 deps app / 3 deps server, mismas que en base.

## 5. Invariante huésped (CRÍTICO) — cero selectores dark sin prefijo `.admin-theme`
- `grep 'data-theme' styles.css | grep -v 'admin-theme'` → solo 1 match, es un **comentario** (línea 796). **0 selectores reales sin prefijo.**
- Los 50+ overrides oscuros (líneas 798–962) arrancan todos con `:root[data-theme='dark'] .admin-theme …`. Revisión visual completa del bloque: correcto.
- Los 4 matches de `background: #26262A` (867/872/920/936) están DENTRO de reglas scoped (falsos positivos de grep de superficie).
- Los únicos importadores de `useTheme`/`ThemeToggle` son `AdminLogin.tsx` y `AdminDashboard.tsx`. `GuestLogin.tsx` y `GuestReservation.tsx` no importan nada del tema (grep exit=1).
- `main.tsx`: rutas huésped (`/rr/app/reserva`, `/:pnr`) renderizan componentes guest SIN `admin-theme` ni `data-theme`.
- Guard anti-FOUC en `index.html`: `location.pathname.indexOf('/admin') !== -1` — cubre `/admin` (dev) y `/rr/app/admin` (staging), jamás `/reserva`.
- Limpieza: `useEffect` de `useTheme` hace `removeAttribute('data-theme')` al desmontar — la sesión SPA no deja oscuro al navegar a rutas guest.
- Zero `prefers-color-scheme` / `matchMedia` → default claro confirmado.

## 6. localStorage + data-theme según spec (`ux-modo-oscuro.md`)
- Key exacta `rumihome.theme` (`STORAGE_KEY`). Default `'light'` (solo `'dark'` activa oscuro).
- `setItem` en toggle, `getItem` al inicializar. Confirmado en bundle (`grep -c 'rumihome.theme'` en JS = 1; `data-theme` ×2 = set + remove).
- `<html data-theme="dark|light">` solo en rutas admin (anti-FOUC + hook). `color-scheme: dark` dentro del bloque admin.
- Gráficos `DashboardTab`: hex → `var(--chart-grid/green/blue/axis/text)` y `var(--sage)` tal cual la tabla de la spec (diffline por línea OK).
- Spec ligada: `.auth-card { position: relative }` ✔, `.admin-topbar-actions` ✔, `.btn` `color: var(--on-accent)` ✔, toggle 44×44 con `role="switch"`/`aria-checked` ✔.

## 7. Pruebas funcionales staging (curl)
- `https://rumihome.io/rr/` → 200 (landing espejo OK).
- `https://rumihome.io/rr/app/` → 200 pero **sirve el build ANTERIOR** (`index-DeqaOngn.js`, sin script anti-FOUC, sin CSS oscuro). Esperado: el deploy a staging ocurre SOLO con GO del QA.
- `/rr/api/*`: `reservas/resumen`, `stats/supermercado`, `energetico/uso` → 401 "No autenticado" (API arriba, middleware auth activo). Endpoints logrados vía `localhost` → 404 (nginx por Host/HTTPS). sin cambios de API en la feature.
- E2E visual (tabs, toggle, anti-FOUC real en navegador) queda como **gate UX post-deploy** (checklist en `ux-modo-oscuro.md` §6).

## Resultado
Todos los criterios del pedido de QA pasan → **GO** (ver `.rr/qa-veredicto.md`).
---

# QA/Backend Notas — Endpoint GET /api/analytics/expense-ranking (rama `rr-t2-ranking`)

**Fecha:** 2026-09-20
**Rol:** Backend (pruebas funcionales pre-QA)

## 1. Estado
- Branch: `rr-t2-ranking`, HEAD previo `1bdb068`. Sin `.rr/HALT`.
- Cambios: solo `server/src/db/finance.ts` + `server/src/routes/finance.ts` (nada en app/, landing/, otros routers, auth).

## 2. Build (docker node:22-alpine)
- `npm run typecheck` → OK sin errores.
- `npm run build` → OK sin errores.
- Rebuild imagen api-rr (`docker compose -f docker-compose.rr.yml up -d --build api-rr`) → container recreado; `dist/routes/finance.js` contiene `expense-ranking`.

## 3. Datos de prueba sembrados en DB staging (para QA)
- Insertados en `expenses` (descripción `QA prueba expense-ranking`):
  - id 2: servicios/luz 30000 @ 2026-08-05
  - id 3: mantencion 20000 @ 2026-08-12
  - id 4: insumos 5000 @ 2026-08-20
- Pre-existente: id 1 servicios 28500 @ 2026-09-01 ("Cuenta septiembre").
- Borrar con `DELETE /api/expenses/{id}` o reset staging (`staging-seed.db`).

## 4. Prueba funcional (server efímero con financeRouter dentro del container, DB staging)
| Caso | HTTP | Respuesta |
|---|---|---|
| sin params (default = mes anterior) | 200 | `{"month":"2026-08","property_id":1,"total_expenses":55000,"ranking":[{"category":"servicios","total":30000,"percentage":54.5},{"category":"mantencion","total":20000,"percentage":36.4},{"category":"insumos","total":5000,"percentage":9.1}]}` |
| `?month=2026-08` | 200 | idéntico al default (consistente) |
| `?month=2026-08&property_id=1` | 200 | idéntico |
| `?month=2026-07` (sin gastos) | 200 | `{"month":"2026-07","property_id":1,"total_expenses":0,"ranking":[]}` |
| `?month=invalido` | 400 | `{"error":"Mes inválido"}` |
| `?month=2026-13` / `?month=2026-00` | 400 | `{"error":"Mes inválido"}` (validación extra de rango 01–12, evita 500) |
| `?month=2026-08&property_id=abc` | 400 | `{"error":"Propiedad inválida"}` |

- Ranking DESC ✔ (30000 > 20000 > 5000); porcentajes suman 100.0 (54.5+36.4+9.1) ✔; shape `{month, property_id, total_expenses, ranking:[{category,total,percentage}]}` ✔; solo categorías con gasto > 0 ✔.

## 5. Auth real del staging
- `GET http://127.0.0.1:3001/api/analytics/expense-ranking?month=2026-08` (api-rr real, sin token) → **401 `{"error":"No autenticado"}`** → ruta montada bajo `requireAdmin` ✔.

---

# QA Notas — Re-validación endpoint expense-ranking (commit `e10b028`, rama `rr-t2-ranking`)

**Fecha:** 2026-09-20
**Rol:** QA (auditoría final, independiente de la del backend)
**Commit validado:** `e10b028 rr(backend): endpoint expense-ranking`

## 1. Estado inicial
- Branch `rr-t2-ranking` en `e10b028` (HEAD). Working tree limpio. Sin `.rr/HALT`.
- Containers staging arriba: `rumihome-api-rr` (172.16.1.2:3001, bind `./data -> /data`), `rumihome-app-rr`.

## 2. Build limpio (docker node:22-alpine)
- `docker run --rm -v /opt/rumihome-rr/server:/build -w /build node:22-alpine sh -c "rm -rf dist && npm run build"` → `tsc` **EXIT=0**, sin errores.
- `server/dist/routes/finance.js` contiene `expense-ranking` (grep ×2) y `server/dist/index.js` monta `app.use('/api', requireAdmin, ...)` (línea 20 del dist).
- Dist regenerado es artefacto gitignoreado; árbol quedó limpio.

## 3. Alcance del diff (`git diff --name-only rr...rr-t2-ranking`)
Solo `server/` + `.rr/`:
- `server/src/db/finance.ts` (tipos `ExpenseRankingEntry`/`ExpenseRanking` + `getExpenseRanking`)
- `server/src/routes/finance.ts` (ruta `GET /analytics/expense-ranking`)
- `.rr/plan.md`, `.rr/qa-notas.md` (docs)
- **Cero** cambios en `app/`, `landing/`, `server/src/index.ts` (el mount con `requireAdmin` es **pre-existente**), otros routers, auth, package.json, compose, DB.
- Sin `console.log`/`TODO`/`FIXME`/tokens/secretos en el diff del código.

## 4. Ruta bajo requireAdmin
- `server/src/index.ts:26` → `app.use('/api', requireAdmin, adminRouter, financeRouter, smarthomeRouter)` (ya existía; la ruta nueva hereda el middleware).
- Verificación real: `curl http://172.16.1.2:3001/api/analytics/expense-ranking?month=2026-08` sin token → **401 `{"error":"No autenticado"}`**.

## 5. Revisión de lógica
- `getExpenseRanking(month, propertyId?)`: `from = ${month}-01`, `to` = primer día del mes siguiente (mismo patrón `+32 días` que `getFinanceSummary`), query `GROUP BY category ORDER BY total DESC`, filtro `r.total > 0`, `total_expenses` = suma de totales, `percentage = Math.round((total/total_expenses)*1000)/10`.
- Ruta: month por defecto = mes calendario anterior (UTC); regex `/^\d{4}-\d{2}$/` + rango 01–12 → 400 `{error:'Mes inválido'}` (evita 500 con `2026-13`/`2026-00`); `property_id` default 1 validado `integer > 0` → 400 `{error:'Propiedad inválida'}`.

## 6. Validación contra copia de DB (`.rr/qa-copy.db`)
- ⚠️ Nota metodológica: `data/rumihome.db` está en **modo WAL**; `cp` directo del archivo principal pierde lo que está en el `-wal` (el copy inicial quedó SIN los gastos sembrados 2026-08). Snapshot consistente vía `VACUUM INTO` desde `node --experimental-sqlite` (read-only sobre `data/rumihome.db` → `.rr/qa-copy.db`). Se reproduce la lógica del endpoint y da **13/13 PASS**:
  - 2026-08 → `servicios 30000 > mantencion 20000 > insumos 5000` (DESC), total 55000, % 54.5 / 36.4 / 9.1, suma = 100.0 exacto.
  - Frontera correcta: expense 2026-09-01 (28500) EXCLUIDO de 2026-08 e INCLUIDO en 2026-09 (100%).
  - Mes sin gastos (2026-07) → `{"month":"2026-07","total_expenses":0,"ranking":[]}`.
  - `property_id=2` (sin gastos) → rankings vacíos.
  - `to` calculado = primer día del mes siguiente, incluso cruce de año (2026-12 → 2027-01-01).
  - `defaultMonth` con fecha sistema 2026-09-20 → 2026-08 ✔.

## 7. Prueba funcional HTTP (server efímero con `financeRouter` compilado dentro de `rumihome-api-rr`, puerto 3899)
| Caso | HTTP | Respuesta |
|---|---|---|
| sin params (default) | 200 | `{"month":"2026-08","property_id":1,"total_expenses":55000,"ranking":[servicios 30000 54.5, mantencion 20000 36.4, insumos 5000 9.1]}` |
| `?month=2026-08` | 200 | idéntico (consistente) |
| `?month=2026-08&property_id=1` | 200 | idéntico |
| `?month=2026-07` (sin gastos) | 200 | `total_expenses:0, ranking:[]` |
| `?month=invalido` | 400 | `{"error":"Mes inválido"}` |
| `?month=2026-13` / `2026-00` | 400 | `{"error":"Mes inválido"}` |
| `?month=2026-08&property_id=abc` / `0` / `1.5` | 400 | `{"error":"Propiedad inválida"}` |

- Proceso efímero terminado (kill) después de la prueba; sin restos.

## Resultado
Todos los criterios del pedido QA pasan → **GO** (ver `.rr/qa-veredicto.md`).
