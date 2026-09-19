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

# Adenda — Escenario 1: Modo oscuro admin (commit `6fada5c`)

**Fecha:** 2026-09-19
**Commit validado:** `6fada5c rr(frontend): modo oscuro admin`
**Branch:** `rr-feature-1-modo-oscuro`
**Entorno:** staging espejo (app en `/rr/app/`)
**Spec de referencia:** `.rr/ux-modo-oscuro.md` (gate doble ux, entregada pre-código)

## Resultado: NO-GO ⚠️ (desviación del aislamiento §1 de la spec; corrección menor antes de staging)

## Criterios verificados

### 1) Build en `app/` — ✅ PASA
- `docker compose -f docker-compose.rr.yml build app-rr` con el `Dockerfile` de `app/` (etapa `npm install && npm run build`): imagen construida OK con los args del espejo (`VITE_ADMIN_PATH=/rr/app/admin`, `VITE_GUEST_PATH=/rr/app/reserva`, `VITE_BASE_PATH=/rr/app/`). Solo warnings no bloqueantes (npm audit, import dinámico).

### 2) Alcance del diff: solo `app/`, exactamente los 7 archivos esperados — ✅ PASA
- `git diff --name-only 6fada5c^..6fada5c` → 7 archivos, todos bajo `app/`:
  `app/index.html`, `app/src/components/ThemeToggle.tsx`, `app/src/hooks/useTheme.ts`, `app/src/pages/AdminDashboard.tsx`, `app/src/pages/AdminLogin.tsx`, `app/src/pages/DashboardTab.tsx`, `app/src/styles.css`.
- Working tree: solo `.rr/` (`plan.md` modificado, `qa-veredicto.md` y `ux-modo-oscuro.md`). Nada fuera de `app/` + docs de RR.

### 3) Nada fuera del área admin tocado — ✅ PASA
- `GuestLogin.tsx`, `GuestReservation.tsx` NO están en el diff (idénticos a `6fada5c^` y a `origin/rr`).
- `server/`, `landing/`, `agent/`, `scripts/`, compose, nginx, `litestream.yml`: 0 diffs en el commit (verificado con `--stat` excluyendo `app/` = vacío).

### 4) localStorage + data-theme — ✅ FUNCIONA (con desviación estructural, ver Observaciones)
- **Clave y default**: `rumihome.theme`, `light`|`dark`, default `light`, sin `prefers-color-scheme` (`useTheme.ts`).
- **Hook**: lee `localStorage`, escribe en toggle y sincroniza `document.documentElement.dataset.theme` (§6 spec: ✓).
- **Anti-FOUC**: script inline en `app/index.html` lee `localStorage['rumihome.theme']` y setea `data-theme='dark'` en `<html>` SOLO en rutas admin (usa `%VITE_ADMIN_PATH%` con fallback al placeholder `%`), antes de `main.tsx` (§6 spec: ✓).
- **Aislamiento huésped**: hoy el huésped se ve claro en todos los flujos alcanzables: el script anti-FOUC está gateado por ruta admin y `useTheme` vive solo en montajes de admin; el portal huésped comparte clases (`.auth-card`, `.alert.*`, `.badge.*`, `.btn`) pero al cargar `/reserva` en un documento nuevo `data-theme` nunca se setea.
- **SVGs de charts**: `DashboardTab.tsx` migra `fill`/`stroke` inline a tokens `var(--chart-*)` con valores por tema (§4 spec: ✓, con naming propio en vez de `var(--muted)`/`var(--text)`).

### 5) Sin deps nuevas — ✅ PASA
- `app/package.json` y `package-lock.json`: 0 diffs vs `origin/rr` y vs `6fada5c^`. Sin dependencias nuevas.

## Observaciones

### ⚠️ BLOQUEANTE — Contramedida obligatoria §1 NO implementada
La spec marca como **obligatoria** la contramedida de aislamiento: agregar la clase `admin-theme` a los wrappers de admin (`AdminLogin.tsx` → `auth-wrapper admin-theme`; `AdminDashboard.tsx` → `admin-shell admin-theme`) y escribir TODOS los overrides/tokens oscuros bajo el prefijo `:root[data-theme='dark'] .admin-theme …`. La implementación:
- **No agrega `admin-theme` en ningún lado** (grep = 0 matcheos en `app/`).
- Escribe los tokens oscuros a nivel global `:root[data-theme='dark']` y los overrides como `[data-theme='dark'] .auth-card`, `.badge.*`, `.alert.*`, `.cal-day`, `.pill-*`, `tbody td`, etc., **sin prefijo de contenedor admin**.

Riesgo concreto: el portal huésped usa esas mismas clases (`.auth-wrapper`, `.auth-card`, `.alert error/ok/info`, `.badge ${status}`, `.btn`). Hoy no hay ruta SPA que navegue admin→guésped sin recarga de documento (no hay `Link` directo al guest path y el `*` redirige a `/admin`), así que el criterio 3 de aceptación se cumple **por accidente de rutas, no por diseño**. Además `useTheme` no limpia `data-theme` al desmontar; cualquier futuro link admin→huésped (ej. el backlog "soporte a huéspedes") oscurecería el portal del huésped.

**Remediación (small):**
1. `AdminLogin.tsx`: `<div className="auth-wrapper admin-theme">`; `AdminDashboard.tsx`: `<div className="admin-shell admin-theme">`.
2. Envolver el bloque de tokens en `:root[data-theme='dark'] .admin-theme { … color-scheme: dark; }` y prefijar los overrides como `[data-theme='dark'] .admin-theme …` (incluye topbar, alerts, badges, tablas, tabs, calendario, modal, pills, device-cards, formularios).
3. (`color-scheme: dark` queda confinado al bloque admin; el huésped jamás aplica oscuro ni scrollbars/selects oscuros.)

### No bloqueantes (cubiertas por el gate visual de ux)
- **Paleta**: hex distintos a la spec (§2): `--bg #0d0d0f` (spec `#161619`), `--soft #26262a` (spec `#2C2C2F`), `--tile #19191c` (spec `#1C1C1F`), `--accent-dark #E00B41` (spec `#FF5474`). Misma familia, contraste AA razonable, pero no son los valores aprobados en la spec.
- **`.btn`**: se migra `color: var(--white)` → `#fff` hardcodeado en lugar del token `--on-accent` de la spec (§2). Resultado visual idéntico (blanco sobre CTA en ambos temas), pero no sigue el token.
- **ThemeToggle**: usa `role="switch"` + `aria-checked` en vez del `aria-pressed` de la spec (§5) — patrón a11y válido y equivalente; y en el login va en la esquina del `.auth-card` (absoluto) en lugar de `position: fixed` del viewport (§5). Funcional, requiere OK visual de ux.
- **`.btn.danger`**: la spec overridea bg en oscuro (`#A6402E`); la implementación solo ajusta el hover (`#CE5E58`) y deja el bg base del tema claro. Verificar contraste en el gate visual.

## Veredicto
**NO-GO** — build, alcance y deps perfectos (criterios 1, 2, 3 y 5 ✅, 4 funcional hoy ⚠️), pero la contramedida de aislamiento del huésped que la spec marca como **obligatoria** quedó fuera: el oscuro se aplica por selectores globales no anclados a un marcador de admin. Corregir el scaffolding `.admin-theme` (remediación arriba, ~3 ediciones) y re-validar antes de deployar a staging.

---

# Adenda — Escenario 1: Re-validación post-fix (commit `16818ec`)

**Fecha:** 2026-09-19
**Commit validado:** `16818ec rr(frontend): fix scope modo oscuro (NO-GO QA)` (el fix del pedido 16818bc/16818ec quedó consolidado en `16818ec`; `16818bc` no existe en el repo ni en el reflog)
**Branch:** `rr-feature-1-modo-oscuro`
**Espec de referencia:** `.rr/ux-modo-oscuro.md` (§1 aislamiento huésped — contramedida obligatoria)
**Contexto:** re-validación del NO-GO previo (arriba)

## Resultado: GO ✅ (remediación del NO-GO implementada y verificada)

## Criterios verificados (escenario 1 modo oscuro)

### 1) `admin-theme` presente en los wrappers de admin — ✅ PASA
- `app/src/pages/AdminDashboard.tsx:36` → `<div className="admin-shell admin-theme">` (envuelve topbar + tabs).
- `app/src/pages/AdminLogin.tsx:36` → `<div className="auth-wrapper admin-theme">`.
- Portal huésped (`GuestLogin.tsx`, `GuestReservation.tsx`) sin `admin-theme` y sin diff vs `origin/rr`.

### 2) Todos los overrides oscuros prefijados bajo `.admin-theme` — ✅ PASA
- Grep `:root[data-theme` en `app/src/styles.css`: las 67 ocurrencias (líneas 27 y 54–119) incluyen `… .admin-theme`; **cero** `:root[data-theme='dark']` sueltos sin prefijo (grep inverso = 0 matches).
- Siendo único CSS con dark selectors: `styles.css`; sin `prefers-color-scheme`.
- `color-scheme: dark` confinado al bloque `:root[data-theme='dark'] .admin-theme {…}` (línea 28); `:root` base mantiene `color-scheme: light`. Huésped jamás hereda oscuro ni scrollbars/selects oscuros.
- Riesgo del NO-GO resuelto **por diseño**: aunque `data-theme` existiera en una vista huésped, los tokens oscuros solo se redefinen dentro de `.admin-theme`.

### 3) `useTheme` limpia `data-theme` al desmontar — ✅ PASA
- `app/src/hooks/useTheme.ts:41-45`: cleanup del `useEffect` ejecuta `delete document.documentElement.dataset.theme`; cualquier desmontaje (p.ej. futura navegación admin→guest) deja el documento sin `data-theme`.

### 4) Build en `app/` — ✅ PASA
- `npm install --no-fund --no-audit` + `npm run build` (`tsc -b && vite build`) en copia descartable con `node:22-alpine` (mismo runtime del Dockerfile): ✓ 57 módulos, `dist/` generado en 2.68s.
- Warnings no bloqueantes ya conocidos: placeholder `%VITE_ADMIN_PATH%` (solo en build sin args; en el Dockerfile del espejo la env lo sustituye) y chunk dinámico de `firebase.ts`.
- `app/` worktree limpio tras la verificación; `app/tsconfig.tsbuildinfo` sin diff vs HEAD.

### 5) Diff solo en `app/` — ✅ PASA
- `git diff --name-only origin/rr...HEAD` → 7 archivos, todos bajo `app/`: `index.html`, `components/ThemeToggle.tsx`, `hooks/useTheme.ts`, `pages/AdminDashboard.tsx`, `pages/AdminLogin.tsx`, `pages/DashboardTab.tsx`, `styles.css`.
- Working tree: solo `.rr/` (`plan.md`, este veredicto, `ux-modo-oscuro.md`). Nada en `server/`, `agent/`, `landing/`, `scripts/`, compose, nginx ni DB.
- `app/package.json` y `package-lock.json`: 0 diffs vs `origin/rr` (sin deps nuevas).

### 6) Veredicto actualizado — ✅ PASA

## Observaciones (no bloqueantes, cubiertas por el gate visual de ux)
- Se conservan las observaciones no bloqueantes del NO-GO (hex de paleta §2, `.btn` con `#fff` en vez de token `--on-accent`, ThemeToggle con `role="switch"`, `.btn.danger` sin override de bg base). La contramedida obligatoria §1 quedó implementada; lo visual restante es materia del role ux en staging post-deploy.

## Veredicto
**GO** — la remediación del NO-GO quedó completa en `16818ec`: wrappers con `admin-theme`, 100% de los overrides oscuros prefijados bajo `.admin-theme` y cleanup de `data-theme` al desmontar; build y alcance siguen verdes. Listo para deploy a staging y revisión visual del role ux; la promoción a PROD solo se ejecuta con la aprobación explícita de Daniel ("APROBAR").

---

# Adenda — Escenario 1: Rollback modo oscuro (commit `effd277`)

**Fecha:** 2026-09-19
**Commit validado:** `effd277 rr(frontend): rollback modo oscuro (escenario 1)`
**Branch:** `rr-feature-1-modo-oscuro`
**Tag de referencia:** `scenario-1-base` (= `origin/rr`, estado previo al modo oscuro)
**Entorno:** staging espejo (app en `/rr/app/`)

## Resultado: GO ✅ (reversión completa, idéntica a `scenario-1-base`)

## Criterios verificados (rollback)

### 1) `git diff scenario-1-base -- app/` vacío — ✅ PASA
- `git diff scenario-1-base -- app/` → **0 líneas** (working tree).
- Lista de archivos bajo `app/` idéntica entre `scenario-1-base` y `effd277` (`git ls-tree -r` → `SAME FILE LIST`).
- `git diff scenario-1-base effd277 --stat` → solo 3 docs de coordinación (`.rr/plan.md`, `.rr/qa-veredicto.md`, `.rr/ux-modo-oscuro.md`); nada de producto. La SPA quedó byte-a-byte como antes del modo oscuro.

### 2) Sin rastros de modo oscuro en `app/` — ✅ PASA
- Grep `ThemeToggle|useTheme|data-theme` recursivo sobre `app/` (incluye `src/`, `index.html` y `dist/`): **0 archivos con coincidencias**.
- Eliminados los 2 archivos nuevos (`ThemeToggle.tsx`, `useTheme.ts`) y el script inline anti-FOUC de `app/index.html`; `styles.css` y las 3 páginas (`AdminDashboard`, `AdminLogin`, `DashboardTab`) restaurados a base.

### 3) Build en `app/` — ✅ PASA
- `docker compose -f docker-compose.rr.yml build app-rr` → imagen construida OK (etapa build `npm install && npm run build` del Dockerfile con los args del espejo `VITE_ADMIN_PATH=/rr/app/admin`, `VITE_GUEST_PATH=/rr/app/reserva`, `VITE_BASE_PATH=/rr/app/`). Solo warnings no bloqueantes ya conocidos.

### 4) Infra del espejo intacta — ✅ PASA
- `git diff scenario-1-base effd277 -- docker-compose.rr.yml docker-compose.yml landing/ server/ scripts/ litestream.yml` → **vacío**.
- Working tree sin cambios en infra (`git status --porcelain` sobre esos paths → vacío): `docker-compose.rr.yml`, `landing/` y `server/` presentes sin diffs. La estructura `/rr/` + `/rr/app/` del espejo se conserva (orden explícita: no se toca).

### 5) Veredicto actualizado — ✅ PASA

## Observaciones (no bloqueantes)
- El unico cambio fuera del commit es `.rr/plan.md` (doc de coordinación del pm, sin commitear): reescrito como plan de ROLLBACK del escenario 1. No impacta código ni infra.

## Veredicto
**GO** — el rollback cumple los 5 criterios de Daniel: `app/` idéntico a `scenario-1-base`, cero rastros de `ThemeToggle`/`useTheme`/`data-theme`, build OK e infra del espejo intacta. Puede deployarse a staging para revisión visual; la promoción a PROD solo se ejecuta con la aprobación explícita de Daniel ("APROBAR").
