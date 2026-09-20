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