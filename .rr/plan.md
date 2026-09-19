# Plan: REVERSIÓN total de la estética 90s del espejo (iteración 3)

## Orden de Daniel (iteración 3 — reversion)
Revertir TODA la estética 90s del espejo: la landing (`landing/index.html`) y la SPA (`app/`).
El espejo debe volver a la estética NORMAL (estado `origin/rr`).

## LÍNEA FRONTERA: qué se revierte y qué NO

### SÍ se revierte (estética 90s) — target = `origin/rr`
| Archivo | Cambio a revertir | Origen del cambio |
|---|---|---|
| `app/src/styles.css` | restyling 90s completo (paleta VGA/neón, Comic Sans, bordes bevel/ridge, fondo espacial, cursor crosshair, modal Win95, marquee) | commit `26d2bbc` |
| `app/index.html` | título/favicon/fonts 90s | commit `26d2bbc` |
| `app/src/pages/AdminDashboard.tsx` | marquee + contador de visitas + botón "SALIR" | commit `26d2bbc` |
| `app/src/pages/AdminLogin.tsx` | marquee + botón "ENTRAR" | commit `26d2bbc` |
| `app/src/pages/GuestLogin.tsx` | marquee + botón "VER MI RESERVA" | commit `26d2bbc` |
| `app/src/pages/GuestReservation.tsx` | marquees + banner "Internet Explorer 4.0" + logo "★ 9X" | commit `26d2bbc` |
| `app/src/pages/DashboardTab.tsx` | paleta de gráficos retro | commit `26d2bbc` |
| `app/src/components/RetroScroller.tsx` | **ELIMINAR** (archivo nuevo 90s) | commit `26d2bbc` |
| `landing/index.html` | restyling 90s de las 7 secciones (+203/−102) | commit `033b4d0` |

### NO se revierte (infra de estructura `/rr/`, orden explícita de Daniel)
- `docker-compose.rr.yml` — queda intacto: `VITE_BASE_PATH=/rr/app/`,
  `VITE_ADMIN_PATH=/rr/app/admin`, `VITE_GUEST_PATH=/rr/app/reserva`, `VITE_APP_ID`.
- Rutas del espejo en `landing/index.html`: `/rr/img/*`, `/rr/app/reserva` (cambios del commit `badcdd4`).
- Estructura portada `/rr/` (landing) + SPA `/rr/app/` SE MANTIENE.
- `app/` nunca se movió físicamente; `/rr/app/` es solo ruta de servicio (Vite base path). Rever `app/` a `origin/rr` NO rompe la estructura.

### Fuera de alcance (prohibido tocar)
`server/`, `agent/`, `scripts/`, `litestream.yml`, config nginx, credenciales.
Los docs `.rr/ux-landing-90s.md` y `.rr/qa-veredicto.md` se conservan como ARCHIVO de historial; no se borran.

## RUTEO
- pm: APLICA — redacta este plan (no codea).
- supervisor: APLICA — audita que la reversión NO toque infra (compose, rutas `/rr/`, server, agent).
- ux: NO APLICA (spec) — no hay diseño nuevo que especificar (el target estético ES `origin/rr`);
  APLICA SOLO en revisión visual del staging post-deploy (gate doble).
- frontend: APLICA — ejecuta la reversión en `app/` y `landing/index.html`.
- backend: NO APLICA — no hay cambios de datos ni endpoints.
- qa: APLICA — build, control de alcance y veredicto GO/NO-GO.

## TAREAS
1. [frontend] Revertir `app/` al estado `origin/rr`
   - Comando sugerido: `git checkout origin/rr -- app/` (o `git revert 26d2bbc`).
   - Elimina `app/src/components/RetroScroller.tsx`; restaura `styles.css`, `index.html`
     y las 5 páginas a su versión normal.
   - Criterios: `git diff origin/rr -- app/` vacío; build OK (`docker build` del Dockerfile de `app/`);
     SPA sigue sirviendo en `/rr/app/` (compose NO se toca).
   - Estado: pendiente
2. [frontend] Revertir `landing/index.html` al estado pre-90s
   - Comando sugerido: `git checkout 033b4d0~1 -- landing/index.html` (= estado `badcdd4`).
   - Criterios: `git diff badcdd4 -- landing/index.html` vacío;
     conserva rutas `/rr/img/*` y `/rr/app/reserva` (infra NO revertida),
     lightbox JS, `mailto`, anclas `#amenidades/#galeria/#reservar` y todo el contenido/textos.
   - Estado: pendiente
3. [ux] Revisión visual en staging post-deploy (gate doble)
   - Criterios: `/rr/` y `/rr/app/` lucen como PROD normal — sin marquee, sin paleta VGA/neón,
     sin Comic Sans, sin cursor crosshair, sin blink, sin bordes bevel/Win95.
   - Estado: pendiente
4. [qa] Validación final
   - Criterios: `git diff origin/rr..HEAD --name-only` limitado a `app/*` y `landing/index.html`
     (diferencias = solo la reversión aplicada o vacías); nada en `server/`, `agent/`, `scripts/`,
     `docker-compose.rr.yml`, nginx, `litestream.yml`; build limpio; veredicto GO/NO-GO en `.rr/qa-veredicto.md`.
   - Estado: pendiente
5. [pm] Registrar resultado en historial de desviaciones y confirmar alcance de infra intacta
   - Estado: pendiente

## DESVIACIONES (historial)
- Iteración 1: PM codeó directamente (violación de rol) → corregido: prohibición explícita en su prompt.
- Iteración 1: plan.md no existía al iniciar frontend → corregido: regla "plan antes de asignar".
- Iteración 1: permisos endurecidos (external_directory deny, /root y /etc/nginx bloqueados).
- Iteración 2: compromiso de NO codear (plan escrito ANTES de asignar a ux/frontend/qa).
- Iteración 3: Daniel revierte la estética 90s completa (landing + SPA). La infra `/rr/`
  (portada + `/rr/app/`, compose, rutas `/rr/*`) es orden explícita de NO revertir.