# QA Veredicto — Feature: Estética 90s para el sitio del espejo

**Fecha:** 2026-09-18
**Branch:** rr-feature-estilo-90s
**Revisado por:** QA (auditoría pre-deploy)

## Resultado: ALINEADO ✅ (procede a staging)

## Criterios verificados

### 1) Alineación con el pedido ("estilo visual del sitio del espejo → estética 90s") — ✅ PASA
- `styles.css`: restyling completo 90s (paleta VGA/neón, Comic Sans, bordes bevel/ridge, fondo espacial, cursor crosshair, tablas con borde, modal estilo Win95, marquee con animación CSS).
- Páginas: AdminDashboard (marquee + contador de visitas + botón "SALIR"), AdminLogin/GuestLogin (marquee + botones "ENTRAR"/"VER MI RESERVA"), GuestReservation (marquees + banner "Internet Explorer 4.0" + logo "★ 9X"), DashboardTab (paleta de gráficos a colores retro). Todo cosmético: sin cambios de handlers, lógica o datos.
- `index.html`: título, favicon 🏠, Google Fonts (Comic Neue vía CDN).
- `RetroScroller.tsx`: marquee implementado con `<div>` + `@keyframes marquee-scroll` (sin tag nativo `<marquee>`, verificado por grep).

### 2) Alcance: solo `app/` (+ doc de coordinación) — ✅ PASA
- `git diff origin/rr..HEAD --name-only` → `.rr/plan.md` y 9 archivos bajo `app/`. Nada en `server/`, `agent/`, `landing/`, `scripts/`, compose ni infra.
- `tsconfig.tsbuildinfo` es artefacto build ya versionado (mismo comportamiento que en base).

### 3) Build en app/ — ✅ PASA
- Verificado con `docker build` del `Dockerfile` de `app/` (imagen exportada, `npm run build` OK). Previo al fix `26d2bbc` fallaba por `<marquee>` nativo en JSX (TS2339); eliminado.

### 4) Sin deps nuevas — ✅ PASA
- `app/package.json` y `package-lock.json` sin cambios. Comic Neue es recurso externo en runtime (no dependencia npm).

## Observaciones (no bloqueantes)
- `.rr/ux-estilo-90s.md` (spec UX pre-código) NO existe en el repo, aunque `plan.md` la declara "hecha". El gate doble de UX queda pendiente de la revisión visual en staging post-deploy.
- Desviaciones de rol (PM codeó) ya están registradas en `plan.md` con su corrección de prompts; no es desviación de código.

## Recomendación
Deploy a staging para revisión visual del UX (gate doble), y luego promoción a PROD solo con la aprobación explícita de Daniel.

---

# Adenda — Iteración 2: Landing 90s (commit `033b4d0`)

**Fecha:** 2026-09-18
**Commit validado:** `033b4d0 rr(frontend): landing 90s`
**Entorno:** staging espejo (branch rr, landing en `/rr/`)

## Resultado: GO ✅ (iteración 2 lista)

## Criterios verificados

### 1) Alcance del diff — ✅ PASA
- `git diff --name-only 033b4d0^..033b4d0` → solo `landing/index.html` (1 archivo, +203/−102).
- Working tree solo tiene cambios en `.rr/` (`plan.md` modificado; `qa-veredicto.md` y `ux-landing-90s.md` nuevos). Nada en `app/`, `server/`, `agent/`, `scripts/`, compose ni infra.

### 2) Invariantes intactos — ✅ PASA
- **Lightbox JS**: `<script>` y markup del lightbox sin cambios (solo se tocó CSS; el JS de galería prev/next/keyboard/swipe queda tal cual).
- **mailto**: `mailto:tu-correo@rumihome.io` conservado (se quitó solo el inline `background:var(--text)`, reemplazado por la clase `.cta-pill.small` nueva).
- **Anclas**: `#amenidades`, `#galeria`, `#reservar` presentes y funcionales (nav, hero, footer).
- **Rutas `/rr/*`**: intactas — `/rr/img/hero.jpg`, `/rr/img/g1..g9.jpg`, `/rr/app/reserva`.

### 3) Paleta 90s implementada — ✅ PASA
- **Comic Neue**: `<link>` a Google Fonts + `font-family: 'Comic Sans MS', 'Comic Neue', ...`.
- **#0a0a3c**: presente como `theme-color` y `--bg` del cielo estrellado.
- **Marquee sin tag nativo**: `.marquee` con `.marquee-track` animado por `@keyframes marquee-scroll`; `grep -c "<marquee"` = 0.

### 4) Build/SPA — ✅ PASA
- Landing es estática: no requiere build.
- SPA sigue compilada en el container: `rumihome-app-rr` tiene `/app/dist/index.html` con `assets/index-B7FA7ypr.js` y `index-D1EAL8aQ.css` (build del día), apuntando a base `/rr/app/` (VITE_BASE_PATH correcto).

### 5) Veredicto actualizado — ✅ PASA

## Observaciones (no bloqueantes)
- Spec UX existe: `.rr/ux-landing-90s.md`. Pendiente la revisión visual del staging post-deploy (gate doble del rol ux).
- Mailto sigue con placeholder `tu-correo@rumihome.io` (valor preexistente, fuera del alcance de esta iteración).

## Veredicto
**GO** — iteración 2 cumple los 5 criterios. Puede pasar a revisión visual/UX del staging.

---

# Adenda — Iteración 3: Reversión total estética 90s (commit `6318630`)

**Fecha:** 2026-09-19
**Commit validado:** `6318630 rr(frontend): reversion estetica 90s`
**Entorno:** staging espejo (branch `rr-feature-estilo-90s`)

## Resultado: GO ✅ (reversión lista)

## Criterios verificados

### 1) Build en `app/` — ✅ PASA
- `npm run build` OK (`tsc -b && vite build`, 55 módulos, dist generado) ejecutado con Node v22.23.2 (mismo runtime del Dockerfile). Solo warning no bloqueante de bundling (import dinámico de `firebase.ts`).
- Nota: `tsc -b` regenera `app/tsconfig.tsbuildinfo` (artefacto del build ya versionado en base); se restauró a `HEAD` y es idéntico a `origin/rr`.

### 2) Diff `app/` vs `origin/rr` — ✅ PASA
- `git diff origin/rr -- app/` = 0 líneas (vacío) con working tree limpio en `app/`.
- La reversión restauró `styles.css`, `index.html`, las 5 páginas y eliminó `RetroScroller.tsx`; la SPA queda idéntica a la base normal.

### 3) Landing sin 90s — ✅ PASA
- Grep en `landing/` (incluye `index.html`): **Comic Neue** → 0 matches; **marquee-track** → 0 matches; **#0a0a3c** → 0 matches.
- `git diff origin/rr -- landing/index.html` muestra SOLO las rutas `/rr/*` (`/rr/app/reserva`, `/rr/img/*`) — infraestructura del espejo que por orden explícita NO se revierte. Sin restyling 90s.

### 4) Veredicto actualizado — ✅ PASA

## Control de alcance (infra intacta)
- `git diff origin/rr --name-only` → solo `.rr/plan.md` (doc), `docker-compose.rr.yml` (infra espejo, NO revertida) y `landing/index.html` (solo rutas `/rr/*`).
- Nada en `server/`, `agent/`, `scripts/`, `litestream.yml`. Docs de historial `.rr/ux-landing-90s.md` y este veredicto se conservan.

## Observaciones (no bloqueantes)
- Pendiente revisión visual post-deploy del staging (`/rr/` y `/rr/app/` deben lucir como PROD normal) — gate doble del rol ux.

## Veredicto
**GO** — la reversión cumple los criterios de Daniel. Puede deploysar a staging para revisión visual y posterior promoción, que solo se ejecuta con la aprobación explícita de Daniel ("APROBAR").

---

# Adenda — Escenario 2: Expense Ranking (commit `86dd36f`)

**Fecha:** 2026-09-19
**Commit validado:** `86dd36f rr(backend): endpoint expense-ranking`
**Branch:** `rr-feature-2-ranking-gastos`
**Entorno:** staging espejo (todo dentro de `/opt/rumihome-rr`; DB sobre copia `.rr/qa-copy.db` vía `docker exec rumihome-api-rr node` con `node:sqlite`)

## Resultado: GO ✅ (backend listo para staging)

## Criterios verificados

### 1) Build de `server/` — ✅ PASA
- `npm run build` (`tsc`) OK con Node 22 (alpine, mismo runtime del Dockerfile), montando `server/` del repo en un container desechable. `dist/` generado sin errores; `server/dist` está gitignored y el working tree quedó limpio.

### 2) Alcance del commit — ✅ PASA
- `git diff-tree --name-only -r 86dd36f` → solo **3 archivos**: `.rr/plan.md`, `server/src/db/finance.ts`, `server/src/routes/finance.ts`. Nada fuera de `server/` + `.rr/`.

### 3) Ruta bajo `requireAdmin` — ✅ PASA
- `server/src/index.ts:26` → `app.use('/api', requireAdmin, adminRouter, financeRouter, smarthomeRouter)`. Confirmado también en `dist/index.js:20`. El nuevo `GET /api/analytics/expense-ranking` queda protegido por `requireAdmin`.

### 4) Lógica del endpoint — ✅ PASA
- **Orden DESC**: `GROUP BY category ORDER BY total DESC` en `getExpenseRanking`.
- **Porcentaje**: `Math.round((r.total / totalExpenses) * 1000) / 10` (1 decimal, sin dividir por cero).
- **Regex de mes**: `/^\d{4}-\d{2}$/` en la ruta (valida y devuelve 400 si no matchea; rango del mes se calcula con `YYYY-MM-01` a `nextMonth-01`, excluye meses ajenos).
- **Default mes = mes anterior** al actual; `property_id` default `1` (convención multi-propiedad vigente).
- **Prueba real** (`DB_PATH=/qa-copy.db`, copy de `data/rumihome.db`): mes `2026-09` → `total_expenses=28500`, 1 categoría al 100%; total recomputado OK; mes sin gastos → ranking vacío sin error.
- **Prueba sintética multi-categoría** (3 categorías + 1 de otro mes): orden DESC estricto (65000→40000→20000), porcentajes 52/32/16 OK, filas de otro mes excluidas, suma de porcentajes = 100.

### 5) Veredicto actualizado — ✅ PASA

## Observaciones (no bloqueantes)
- El container `rumihome-api-rr` corre un build anterior (la ruta no estaba en su `dist`). Se sincronizaron a HEAD los `dist/db/finance.js` y `dist/routes/finance.js` on-disk para coherencia; el proceso en memoria no se tocó. Para servir el endpoint se requiere **rebuild/redeploy** del container (fuera del alcance de esta QA).
- La copy de DB (`/opt/rumihome-rr/data/rumihome.db` → `.rr/qa-copy.db`) se mantiene junto con los scripts de prueba en `.rr/` como evidencia.
- La DB de staging tiene un solo gasto real (2026-09, servicios/luz 28500); el multi-categoría se validó con DB sintética.

## Veredicto
**GO** — el commit `86dd36f` cumple los 5 criterios de Daniel. Listo para deploy a staging (requiere rebuild del container api-rr) y posterior revisión/promoción con la aprobación explícita de Daniel.