# Plan: Modo oscuro en el panel `/admin` (feature 1)

## Orden de Daniel (feature 1)
Agregar un botón de modo oscuro en el panel `/admin`. Debe alternar entre tema claro y
oscuro, **persistir la preferencia** y **aplicar en todas las páginas del panel**.

## Interpretación de alcance

### SÍ entra
- Todo el área admin de la SPA (`app/`):
  - `/admin` → `AdminLogin.tsx` (entrada del panel).
  - `/admin/panel` → `AdminDashboard.tsx` + sus tabs `ReservasTab`, `DashboardTab`, `GastosRedesTab`.
- Botón de alternancia (sol/luna) visible en el área admin.
- Persistencia en el **cliente** (`localStorage`) — NO requiere backend.

### NO entra (fuera de alcance, prohibido tocar)
- Portal huésped (`/reserva` → `GuestLogin.tsx`, `GuestReservation.tsx`).
- Landing pública (`landing/`).
- `server/`, `agent/`, `scripts/`, `litestream.yml`, `docker-compose.rr.yml`, nginx, credenciales.
- Sync del tema entre dispositivos / preferencia en DB (no pedido; evita tocar API).

### Supuestos APROBADOS por Daniel (2026-09-19) — quedan fijos y no se reabren
1. La preferencia es **por dispositivo** (localStorage), no por usuario en la DB.
2. La pantalla de login admin (`/admin`) **incluye** el toggle (no hay salto claro→oscuro
   al entrar al panel; el tema también se respeta ahí).
3. Tema por defecto = **claro** cuando no hay preferencia guardada.

## RUTEO

| Agente | Aplica | Motivo |
|---|---|---|
| pm | **APLICA** | Clarifica, decide ruteo y redacta este plan. **NO codea.** |
| supervisor | **APLICA** | Audita que no se toquen portal huésped, landing, `server/`, `agent/`, compose ni nginx. |
| ux | **APLICA (primero)** | Es un **cambio de estilo global** → por regla, ux va SIEMPRE antes de frontend. Produce la paleta oscura y la spec de UI (`.rr/ux-modo-oscuro.md`). |
| frontend | **APLICA** | Implementa el toggle, el hook de tema y los overrides de CSS en `app/`. |
| backend | **NO APLICA** | No hay cambios de datos ni endpoints: la persistencia es client-side (localStorage). |
| qa | **APLICA (siempre)** | Build, revisión de diff, pruebas funcionales y veredicto GO/NO-GO en `.rr/qa-veredicto.md`. |

**Reglas de ruteo aplicadas:** feature solo-UI → `ux + frontend`; es cambio de estilo global
→ `ux` primero; "persistir" NO implica datos de servidor → `backend` no aplica; QA siempre.

## TAREAS

1. **[ux] Spec de UI y paleta oscura** — `.rr/ux-modo-oscuro.md`
   - Fuente de verdad del diseño: `app/src/styles.css` (tokens `:root` actuales).
   - Definir paleta oscura equivalente a los tokens existentes (`--bg`, `--text`, `--soft`,
     `--tile`, `--white`, `--gray`, `--muted`, `--dark`, `--accent*`, `--sage*`, `--error`).
   - Definir tratamiento del botón toggle (ubicación en `admin-topbar`, íconos/aria-label,
     estados hover/focus/activo) y su comportamiento en login.
   - Garantizar contraste **WCAG AA** en ambos temas.
   - Inventariar los colores **hardcodeados** que hoy impiden el dark mode (ver inventario abajo)
     e indicar su equivalente oscuro.
   - Estado: **completada (2026-09-19)** → spec en `.rr/ux-modo-oscuro.md`. Incluye ~30 colores duros extra no inventariados, fix de botones (`--white` sobrecargado) y las discrepancias abajo.

**Hallazgos ux (input crítico para frontend):**
- `--white` está sobrecargado (superficie + texto `.btn`): en oscuro los botones quedarían ilegibles → `.btn { color:#fff }`.
- `#1d1d1f` (leyendas SVG de gráficos) es invisible en oscuro → `#F5F5F7`.
- **Alcance:** `data-theme` debe aplicarse SOLO en rutas admin — el portal huésped usa los mismos tokens y se oscurecería sin permiso si se aplicara global.
- Inventario de plan.md incompleto vs código real (p.ej. falta `.alert.info` borde `#d2d2d7`); la spec ux manda.

2. **[frontend] Hook de tema + persistencia**
   - Nuevo hook (p. ej. `app/src/hooks/useTheme.ts`): lee/escribe `localStorage`
     (clave propuesta `rumihome.theme`, valores `light` | `dark`), expone `theme` y `toggleTheme`,
     y aplica `data-theme` en `document.documentElement`.
   - Evitar **FOUC**: aplicar el tema antes del primer render (script inline en `app/index.html`
     o inicialización en `main.tsx`).
   - Estado: **pendiente**

3. **[frontend] Botón de alternancia**
   - Nuevo componente `app/src/components/ThemeToggle.tsx` (accesible: `aria-pressed`/`aria-label`,
     foco visible ya cubierto por `:focus-visible` global).
   - Montarlo en `AdminDashboard.tsx` (topbar) y en `AdminLogin.tsx` según supuesto 2.
   - Estado: **pendiente**

4. **[frontend] Soporte de tema oscuro en CSS**
   - Agregar bloque `:root[data-theme='dark'] { ... }` con la paleta definida por ux.
   - Refactorizar los colores hardcodeados que rompen el tema (reemplazar por tokens o
     variantes oscuras): topbar `rgba(250,249,246,.78)` y borde inferior; fondos de `.badge.*`;
     `.alert.*`; hover de filas/tabs/subtabs; `.cal-day`; colores de texto de `DashboardTab.tsx`
     (SVG de gráficos).
   - Estado: **pendiente**

5. **[frontend] Verificación local + build**
   - `npm run build` en `app/` debe pasar limpio.
   - Probar alternancia, persistencia tras recarga y navegación entre los 3 tabs.
   - Estado: **pendiente**

6. **[ux] Revisión visual en staging post-deploy (gate doble)**
   - Criterios: `/rr/app/admin` y `/rr/app/admin/panel` (login + 3 tabs) se ven correctos en
     claro y oscuro, con contraste AA y sin elementos ilegibles ni flashes de tema.
   - Estado: **pendiente**

7. **[qa] Validación final**
   - `npm run build` limpio; diff limitado a `app/*` (y `.rr/*`); nada en `landing/`,
     `server/`, `agent/`, `scripts/`, `docker-compose.rr.yml`, nginx, `litestream.yml`.
   - Pruebas funcionales: toggle cambia tema, persiste tras recarga, aplica en los 3 tabs.
   - Veredicto GO/NO-GO en `.rr/qa-veredicto.md`.
   - Estado: **pendiente**

8. **[pm] Coordinar iteraciones y registrar desviaciones**
   - Máx. 3 iteraciones; si QA NO-GO o `CAMBIOS:`, vuelve al equipo en el mismo branch.
   - Estado: **pendiente**

## Inventario de colores hardcodeados a revisar (input para ux)
En `app/src/styles.css` (además de los tokens `:root`):
- `.admin-topbar` bg `rgba(250,249,246,0.78)` y borde `rgba(34,34,34,0.08)`.
- `.alert.error|ok|info` (fondos/textos).
- `.badge.pendiente|confirmada|cancelada`.
- Tablas: `border-bottom #EBEBEB`, `tbody tr:hover #F7F7F7`.
- `.main-tab`, `.subtab` (hover/activo).
- Dashboard: `.dashboard-section` bg `#fff`, bordes `#EBEBEB`, h4 `#222222`.
- Calendario: `.cal-day`, `.cal-day.libre`, `.legend.libre::before`.
- Modal overlay `rgba(34,34,34,0.45)` y sombras.
En `app/src/pages/DashboardTab.tsx` (SVG): `#E8E8ED`, `#008234`, `#0071e3`, `#86868b`, `#1d1d1f`.

## Criterios de aceptación (global)
- [ ] Botón de modo oscuro visible y operable en el panel `/admin`.
- [ ] Alterna claro↔oscuro de inmediato en todas las páginas del panel.
- [ ] La preferencia persiste tras recargar y navegar entre tabs.
- [ ] Sin flash de tema incorrecto al cargar.
- [ ] Contraste AA en ambos temas.
- [ ] `npm run build` OK; sin tocar huésped/landing/backend/infra.

## HISTORIAL (iteraciones previas, se conserva como aprendizaje)
- Iteración 1: PM codeó directamente (violación de rol) → PM prohibido de codear.
- Iteración 1: plan.md no existía al iniciar frontend → regla "plan antes de asignar".
- Iteración 1: permisos endurecidos (external_directory deny, `/root` y `/etc/nginx` bloqueados).
- Iteración 2: PM comprometido a NO codear (plan escrito ANTES de asignar).
- Iteración 3: reversión total de la estética 90s (landing + SPA); infra `/rr/` intacta.
