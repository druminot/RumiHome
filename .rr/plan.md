# Plan: Feature modo oscuro en el panel `/admin`

## Orden de Daniel
Agregar un **botón de modo oscuro** en el panel `/admin` de la SPA. Debe
**alternar entre tema claro y oscuro**, **persistir la preferencia** y
**aplicar en todas las páginas del panel** (login + las 3 pestañas del CRM:
Reservas, Dashboard, Gastos & Redes).

## Estado base (verificado por PM)
| Referencia | Commit | Nota |
|---|---|---|
| `origin/rr` | `b9d0d2e` | base del espejo sin la feature |
| `rr-t1-modo-oscuro` | `b9d0d2e` | branch de esta tarea, idéntico a `origin/rr` |

- El admin es una SPA React/Vite en `app/` (`app/src/main.tsx` con rutas
  `VITE_ADMIN_PATH` → `AdminLogin`, `${VITE_ADMIN_PATH}/panel` →
  `AdminDashboard` con tabs `ReservasTab`, `DashboardTab`, `GastosRedesTab`).
- La "fuente de verdad" del diseño es `app/src/styles.css`: tokens `:root`
  (líneas 1–18) + patrones visuales del admin (`.admin-shell`, `.admin-topbar`,
  `.table-wrap`, `.stat-card`, `.calendar-section`, `.dashboard-section`, etc).
- Supuestos aprobados por Daniel en la iteración previa (feature 1):
  **por dispositivo** (sin sync a servidor), **default claro** (no se lee
  `prefers-color-scheme`), toggle presente en login y en el panel.

## LÍNEA FRONTERA: qué se toca y qué NO

### SÍ se toca
| Archivo | Cambio |
|---|---|
| `app/src/hooks/useTheme.ts` | nuevo — hook de tema (leer/alternar/persistir) |
| `app/src/components/ThemeToggle.tsx` | nuevo — botón sol/luna con `role="switch"` |
| `app/src/styles.css` | tokens claros/oscuros, overrides scoped en `.admin-theme`, estilos del toggle |
| `app/index.html` | script inline anti-FOUC que setea `data-theme` antes de pintar |
| `app/src/pages/AdminLogin.tsx` | clase `admin-theme` + `<ThemeToggle>` |
| `app/src/pages/AdminDashboard.tsx` | clase `admin-theme` + `<ThemeToggle>` en la topbar |
| `app/src/pages/DashboardTab.tsx` | colores SVG hardcodeados → `var(--chart-*)`/`var(--sage)` |
| `.rr/plan.md`, `.rr/ux-modo-oscuro.md`, `.rr/qa-veredicto.md` | docs del flujo |

### NO se toca (prohibido)
- Portal huésped (`GuestLogin.tsx`, `GuestReservation.tsx`) y sus clases
  (`.guest-shell`, `.reservation-card`, `.detail-grid`, `.price-summary`,
  `.checkin-section`, `.door-access-*`, `.back-link`): el oscuro NUNCA aplica ahí.
- `server/`, `agent/`, `landing/`, `scripts/`, `docker-compose.rr.yml`, nginx,
  `litestream.yml`, credenciales.
- Rutas `/rr/*` existentes, API, DB.

## RUTEO
Reglas aplicadas: solo UI (admin SPA) → ux + frontend; QA siempre.
- **pm**: APLICA — redacta este plan, aplica las reglas de ruteo, no codea.
- **supervisor**: APLICA — audita que se toque SOLO `app/` y docs `.rr/`.
- **ux**: APLICA — spec (`ux-modo-oscuro.md`) ANTES de codificar desde
  `styles.css`; revisión visual en staging DESPUÉS del deploy.
- **frontend**: APLICA — implementa en `app/`; `npm run build` debe pasar.
- **qa**: APLICA — build limpio, diff acotado, invariantes del huésped y
  veredicto GO/NO-GO.
- **backend**: NO APLICA — sin cambios en `server/`.

## TAREAS
1. [ux] Spec de modo oscuro
   - Criterios: toggle en login y topbar del panel; paleta WCAG AA; oscuro
     aislado vía `.admin-theme` (el portal huésped jamás se oscurece);
     persistencia `localStorage['rumihome.theme']`; default claro; anti-FOUC.
   - Estado: hecho (`.rr/ux-modo-oscuro.md`)
2. [frontend] Implementar
   - `useTheme.ts` + `ThemeToggle.tsx`; `admin-theme` en login y dashboard;
     gráficos de `DashboardTab` a tokens; overrides scoped en `styles.css`.
   - Estado: hecho (commit `rr(frontend): modo oscuro admin`)
3. [qa] Validación
   - `npm run build` limpio; diff solo `app/` + docs `.rr/`; verificar que el
     huésped no hereda el tema (sin `.admin-theme`, sin `data-theme`).
   - Estado: [pendiente]
4. [supervisor] Auditoría de alcance
   - Criterios: fuerte — nada fuera de `app/` y `.rr/`.
   - Estado: [pendiente]
5. [pm] Cierre: registrar resultado en historial (abajo).

## DESVIACIONES (historial acumulado de RR)
- Iteración 1: PM codeó directamente (violación de rol) → corregido: prohibición explícita en su prompt.
- Iteración 1: plan.md no existía al iniciar frontend → corregido: regla "plan antes de asignar".
- Iteración 1: permisos endurecidos (external_directory deny, /root y /etc/nginx bloqueados).
- Iteración 2: compromiso de NO codear (plan escrito ANTES de asignar a ux/frontend/qa).
- Iteración 3: Daniel revierte la estética 90s completa (landing + SPA). La infra `/rr/` es orden explícita de NO revertir.
- Rollback escenario 2: el endpoint expense-ranking quedó fuera de `rr` por NO haberse mergeado;
  el código en `rr` ya era idéntico a `scenario-2-base`. Se mantiene como historial en
  `rr-feature-2-ranking-gastos`.
- Escenario 3 testimonios: GO QA; queda como historial en `rr-feature-3-testimonios`.