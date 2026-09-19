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

# Adenda — Escenario 3: Testimonios de huéspedes en la landing (branch `rr-feature-3-testimonios`)

**Fecha:** 2026-09-19
**Entorno:** staging espejo (landing en `/rr/`)

## Resultado: GO ✅ (cumple el pedido de Daniel)

## Criterios verificados

### 1) Pedido — 3 testimonios ficticios antes del footer — ✅ PASA
- Sección nueva `#testimonios` insertada como ÚLTIMA sección de `<main>`, después de
  `#reservar` y ANTES de `<footer>`.
- 3 tarjetas (`grep -c 'class="testimonial"'` = 3), cada una con estrellas ★★★★★,
  texto breve y footer con avatar (inicial), **nombre** y **comuna**:
  Carolina Salazar (Concepción), Franco Medina (San Pedro de la Paz),
  Valentina Rojas (Talcahuano).

### 2) Alcance — solo landing — ✅ PASA
- `git diff origin/rr --name-only` → `.rr/plan.md` y `landing/index.html` (+
  untracked `.rr/ux-testimonios.md`).
- Nada en `app/`, `server/`, `agent/`, `scripts/`, `docker-compose.rr.yml`, nginx,
  `litestream.yml` ni credenciales.
- Diff en `landing/index.html` es **100% aditivo**: 57 líneas agregadas, 0 removidas
  (la única `-` del diff es el header `--- a/landing/index.html`).

### 3) Invariantes de la landing intactos — ✅ PASA
- Rutas `/rr/img/` (12 referencias) y `/rr/app/reserva` (3) sin cambios.
- `mailto:tu-correo@rumihome.io` conservado (1).
- Anclas presentes: `#amenidades`, `#galeria`, `#reservar` (y nueva `#testimonios`).
- Lightbox (JS + markup `lightbox`, `lbClose`, `lbPrev`, `lbNext`, `lbImg`,
  `lbCaption`) intacto.
- Nav, hero, amenities, galería, book-card y footer sin modificaciones.

### 4) Estética coherente con la landing — ✅ PASA
- Reutiliza tokens del CSS inline: `--bg`, `--tile`, `--border`, `--text`,
  `--text-soft`, `--accent` (estrellas).
- Mismo contenedor `max-width:1440px`, `h2` de 22px, radio 16px y grilla
  `repeat(3,1fr)` del patrón de amenidades.
- Responsive: grilla colapsa a 1 columna en `≤900px` (consistente con las demás
  secciones). Accesible: `aria-labelledby="t-test"`, `aria-label` en estrellas.

## Observaciones (no bloqueantes)
- Pendiente la revisión visual del staging post-deploy (`rumihome.io/rr/`) — gate
  doble del rol ux.
- Testimonios son ficticios (0 datos reales de huéspedes) según lo pedido.

## Veredicto
**GO** — escenario 3 cumple el pedido; puede deployarse a staging para revisión
visual del UX y posterior promoción solo con "APROBAR" de Daniel.