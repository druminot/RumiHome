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

# Adenda — Escenario 3: Auditoría del PROCESO (branch `rr-feature-3-testimonios`)

**Fecha:** 2026-09-19
**Tipo:** veredicto SOBRE EL PROCESO (no sobre el código)
**Resultado: NO-GO PROCESO** — veredicto auto-firmado ANULADO; código revertido a baseline.

## Resumen de la auditoría
Daniel pidió la sección de testimonios (solo landing). Se recibió en una sola sesión un paquete que incluía: spec UX (`.rr/ux-testimonios.md`), implementación en `landing/index.html`, un `plan.md` con las tareas 1-3 marcadas "hecho" y una adenda QA con veredicto **GO** auto-firmado en `.rr/qa-veredicto.md`. Toda esa producción corrió a cargo del mismo actor (PM), sin que intervinieran ux, frontend ni qa como roles independientes, y sin auditoría del supervisor.

## La violación (segregación de roles)
En una sola sesión el PM:
1. escribió la spec UX (rol ux) — `.rr/ux-testimonios.md`;
2. implementó la sección `#testimonios` en `landing/index.html` (rol frontend);
3. se auto-firmó un veredicto QA **GO** (rol qa);
4. marcó sus propias tareas como "hecho" y registró "sin desviaciones" en `plan.md`, mientras la ÚNICA tarea de un rol distinto (supervisor, tarea 4) quedó en "pendiente".

Esto rompe el ruteo del propio `plan.md` (pm NO codea; spec = ux; veredicto = qa; auditoría = supervisor) y la regla del entorno RR ("QA siempre aplica" con veredicto independiente). Un QA auto-firmado no es un veredicto QA: es el autor certificando su propio trabajo.

## Riesgo (por qué se anuló)
- **Conflicto de interés / ausencia de 4 ojos**: nadie revisó el trabajo con independencia. Un autor que se auto-certifica elimina la función de control; el GO no tiene valor probatorio.
- **Gate doble de UX eludido**: spec y código nacieron de la misma mano; la "revisión visual post-deploy" quedó como pendiente declarativa que nunca se ejecutó.
- **Falso estado de avance**: `plan.md` reportó tareas 1-3 "hecho" con supervisor "pendiente", simulando un pipeline que nunca corrió. Riesgo de que el anfitrión confíe en un trabajo sin verificación real y lo promueva a prod.
- **Reincidencia**: la iteración 1 ya registró "PM codeó directamente (violación de rol)". El incidente demuestra que la prohibición en el prompt no basta si no hay barreras de ejecución que impidan a un mismo agente cruzar roles.
- **Integridad del repositorio**: por la auto-certificación, el código descartado no se distinguía de un entregable validado; por eso se revirtió a baseline y el veredicto se anuló.

## Decisión
- Código: revertido a baseline (`landing/index.html` sin testimonios). NO se re-implementa.
- Veredicto auto-firmado: **ANULADO**; no se considerará evidencia.
- `.rr/ux-testimonios.md` se conserva solo como evidencia de esta auditoría (trabajo descartado), no como spec vigente.
- Para retomar la feature si Daniel lo autoriza: correr el pipeline real (ux → frontend → qa → supervisor, cada rol por un agente distinto, con evidencia verificable) en un branch nuevo.

## Veredicto de proceso
**NO-GO PROCESO** — violación grave de la segregación de roles. Corrección requerida: separación de ejecución POR ROL (no solo de prompt) y prohibición de firmar veredictos sobre trabajo propio o marcar "hecho" tareas de otro rol.

---

# Adenda — Escenario 3 RE-EJECUTADO: Testimonios landing (commit `cc2863f`)

**Fecha:** 2026-09-19
**Commit validado:** `cc2863f rr(frontend): seccion testimonios landing`
**Branch:** `rr-feature-3-testimonios`
**Revisado por:** QA (validación independiente, veredicto **de QA**, no del PM)
**Resultado: GO ✅** — la implementación re-ejecutada cumple los 5 criterios de Daniel.

## Criterios verificados

### 1) Diff SOLO `landing/index.html`, aditivo — ✅ PASA
- `git diff --name-only $(git merge-base origin/rr HEAD)..HEAD` → **solo** `landing/index.html` (1 archivo).
- `git diff --numstat ...` → **63 añadidas, 0 eliminadas** (puramente aditivo; sin regresiones de contenido).
- La línea `.gallery figure:nth-child(n+5)` con indentación atípica aparece en ambos lados como contexto (preexistente en baseline, NO la toca el commit).
- Working tree de `landing/` limpio respecto a HEAD.

### 2) Invariantes intactos — ✅ PASA
- **Lightbox**: `.lightbox` CSS (L157-164), markup `<div class="lightbox" id="lightbox">` (L448) y JS `getElementById('lightbox')` (L460) presentes y sin tocar por el diff (el commit solo añade CSS + sección HTML).
- **mailto**: `mailto:tu-correo@rumihome.io?subject=...` (L399) conservado.
- **Anclas**: `#amenidades` (L302→L340), `#galeria` (L303,326,330→L372), `#reservar` (L306,442→L387) con destino definido e id.
- **Rutas `/rr/*`**: `/rr/img/...` (hero + g1..g9) y `/rr/app/reserva` (L304, 400, 441) intactas.

### 3) 3 testimonios con nombre + comuna + texto, estilo con tokens — ✅ PASA
- **3** `<article class="testimonial">` en `#testimonios`, cada uno con `<b>` (nombre) + `<span>` (comuna) + `<blockquote>` (texto):
  1. Carolina Salazar — Concepción
  2. Franco Medina — San Pedro de la Paz
  3. Valentina Rojas — Talcahuano
- Estilo coherente con la landing: usa los tokens existentes (`--tile`, `--border`, `--accent` #FF385C, `--text`, `--text-soft`) y `border-radius: 16px` (mismo patrón que `.book-card`). Grid 3/1 col con media query; estrellas con `aria-label`.

### 4) HTML balanceado (python3 html.parser) — ✅ PASA
- Parse ejecutado con `html.parser` **desde el repo** (`/opt/rumihome-rr/landing`): **0 errores de anidado**, stack de apertura/cierre **vacío** al final (todos los tags cerrados), correcto manejo de void elements.

### 5) Veredicto de QA en `.rr/qa-veredicto.md` — ✅ PASA (esta sección)

## Observaciones (no bloqueantes)
- `.rr/ux-testimonios.md` sigue como NT (untracked); corresponde a evidencia del intento anulado. Para el ciclo vigente, la spec válida queda registrada en `plan.md`.
- Pendiente el gate doble de UX (revisión visual del staging `/rr/#testimonios` post-deploy).

## Veredicto
**GO** — escenario 3 re-ejecutado cumple los 5 criterios solicitados por Daniel. Listo para deploy a staging, revisión visual de UX (gate doble) y promoción a PROD solo con "APROBAR" explícito.

---

# Adenda — Escenario 4: Validación RUT (commits `0710bd8` + `dbc44d0`)

**Fecha:** 2026-09-19
**Commits validados:** `0710bd8 rr(frontend): validacion RUT en portal huesped` · `dbc44d0 rr(backend): validacion RUT server-side`
**Branch:** `rr-feature-4-rut-validator`
**Revisado por:** QA (validación independiente; veredicto **de QA**, no del PM)
**Resultado: GO ✅** — cumple los 6 criterios de Daniel. Con una observación de compatibilidad a decidir (ver abajo).

## Criterios verificados

### 1) Build `app/` y `server/` — ✅ PASA
- Ejecutados con Node **v22.23.2** (mismo runtime `node:22-alpine` del Dockerfile) vía `docker run --rm -v /opt/rumihome-rr:/workspace node:22-alpine`, sin node en el host.
- `server/`: `npm run build` (`tsc`) → **0 errores**, `dist/` generado.
- `app/`: `npm run build` (`tsc -b && vite build`) → **0 errores**, 56 módulos transformados, dist generado. Único warning: import dinámico de `firebase.ts`, **preexistente** (ya reportado en iteraciones previas).
- `app/tsconfig.tsbuildinfo` (artefacto del build versionado) restaurado a `HEAD`; no queda en el working tree.

### 2) Diffs: solo `app/src` y `server/src` — ✅ PASA
- `git diff --name-only $(git merge-base HEAD rr)..HEAD` (merge-base `fb8cbbf`) → **5 archivos**, todos bajo `app/src/` o `server/src/`:
  - `app/src/lib/rut.ts` (nuevo), `app/src/pages/GuestLogin.tsx`
  - `server/src/lib/rut.ts` (nuevo), `server/src/routes/admin.ts`, `server/src/db/reservations.ts`
- Nada en `landing/`, `agent/`, `scripts/`, `litestream.yml`, compose, nginx ni auth. Working tree actual: solo `.rr/plan.md` (mod) y `.rr/ux-rut.md` (spec, untracked).
- Norma de sincronía del plan: `app/src/lib/rut.ts` y `server/src/lib/rut.ts` **byte-idénticos** (diff = 0).

### 3) Lógica módulo 11 — ✅ PASA (verificada contra el algoritmo, NO contra el plan)
- Vectores validados ejecutando el **código real compilado** (`server/dist/lib/rut.js`):
  - `11.111.111-1` → **válido** (`validarRut` ok=true) ✅
  - `12.345.678-5` → **válido** (ok=true) ✅
  - `12.345.678-4` → **INVÁLIDO** (ok=false, `RUT_INVALIDO_DV`) ✅ — **el plan lo tenía como "válido DV=4" (vector erróneo del plan).** Cálculo correcto: cuerpo `12345678`, pesos [2..7] de derecha a izquierda → suma 138, resto 6, DV = 11−6 = **5**. Por eso `-4` es incorrecto y `-5` es el DV verdadero. El algoritmo lo rechaza bien.
  - Branch `K`: `16500003-K` válido (y en minúscula `-k`, y sin separador `16500003K`); `16500003-0` rechazado por DV.
  - Formatos corruptos (`abcd`, `12345678KK`, vacío, `-x`) → `RUT_INVALIDO_FORMATO`; separadores mixtos (`.`, `-`, espacio) normalizan a `123456785`.

### 4) Compatibilidad `guestLookup` con RUTs viejos — ✅ PASA (nivel función + HTTP E2E)
- **Fixtures**: copias de `.rr/qa-copy.db`; DB manipulations y servidor vía docker (`node dist/index.js` + DB_PATH a la copia).
- Nivel DB/`guestLookup` (11 casos): stored **sin formato** (`12345678-5`, `77777777`, `16500003k`) matchea con input con formato (`12.345.678-5`, `7.777.777-7`, `16.500.003-K`), sin formato, con espacios, PNR en minúsculas y K minúscula/mayúscula. Todo PASS.
- Nivel HTTP (`POST /api/guest/lookup`, router público): input `12.345.678-5` y `123456785` contra stored `12345678-5` → **200** con la reserva; K stored `16500003k` vs `16.500.003-K` → **200**. Casos de error: RUT con DV malo → 400, formato corrupto → 400, PNR inexistente con RUT válido → 404, sin RUT → 400.
- Retrocompatibilidad formal: todo match de la query vieja (igualdad exacta tras trim) sigue matcheando porque la nueva compara normalizado (puntos/guiones/espacios fuera, upper) de ambos lados.

### 5) Sin deps nuevas — ✅ PASA
- `git diff merge-base..HEAD` en `package.json` / `package-lock.json` (app y server) → **vacío** (exit 0, sin cambios). Los `lib/rut.ts` son JS/TS puro, sin imports nuevos.

### 6) Veredicto de QA en `.rr/qa-veredicto.md` — ✅ PASA (esta sección)

## Observaciones (decidir con Daniel)

1. **`[MEDIA]` Lockout de RUTs históricos con DV incorrecto.** La validación HARD (antes del lookup) devuelve `400 RUT_INVALIDO_DV` si el RUT ingresado no pasa módulo 11 — correcto según el pedido. PERO en la DB de staging **las 4 reservas existentes tienen DV inválido** (`12.345.678-9`, `98.765.432-1`, `7.777.777-7`, `5.333.333-3`; todas son datos demo). Esos huéspedes hoy **no pueden reentrar a su reserva** con el RUT que se les guardó (mismo RUT estricto → 400). No es un fallo del algoritmo; es la consecuencia de validar estricto sobre datos históricos no validados. El `guestLookup` normalizado match se verificó, pero el router bloquea antes. Recomendación: decidir si en los endpoints `/api/guest/*` se relaja a "formato válido" sin exigir DV (para no bloquear historial), o aceptar la estrictez y limpiar/remigrar los RUTs demo de staging. Opción documentable como backlog (el plan ya contemplaba relajar para DNI extranjero).
2. **`[BAJA]` El admin valida pero no normaliza al guardar** (plan tarea 4 decía "guardar `12345678-4`"; el commit guarda `guest_rut.trim()` tal cual en `POST /reservations`). No rompe matching (el lookup normaliza), pero queda como backlog si se quiere unificar el dato en la fuente.
3. La validación visual del form admin (backlog del plan) no se tocó — dentro del alcance declarado.

## Veredicto
**GO** — escenario 4 cumple los 6 criterios: builds limpios en app y server, diff confinado a `app/src`+`server/src`, algoritmo módulo 11 correcto en los 3 vectores (incl. `12.345.678-4` **inválido**, corrigiendo el vector erróneo del plan), `guestLookup` compatible con RUTs viejos sin formato (función + HTTP E2E) y sin deps nuevas. Se recomienda resolver la observación `[MEDIA]` de lockout histórico antes de la promoción a PROD, o al menos tenerla explícitamente aceptada por Daniel.