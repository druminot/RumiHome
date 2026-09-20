# UX Spec — Modo oscuro en el panel `/admin`

**Fecha:** 2026-09-20 (revisión ux + ajustes sobre v1 del 2026-09-19)
**Branch:** rr-t1-modo-oscuro
**Rol:** ux (spec ANTES de codificar — gate doble)
**Feature:** plan.md tarea 1 → dark mode SOLO en el área admin de la SPA (`app/`).

## Fuente de verdad
1. `app/src/styles.css` — tokens `:root` (líneas 1–18) + patrones visuales del admin.
2. `app/src/pages/AdminLogin.tsx`, `AdminDashboard.tsx`, `DashboardTab.tsx`,
   `ReservasTab.tsx`, `GastosRedesTab.tsx` — estructura donde montar el toggle y
   colores hardcodeados (gráficos SVG en `DashboardTab`).
3. plan.md — supuestos aprobados por Daniel: por dispositivo, default claro,
   toggle en login y panel; oscuro NUNCA en portal huésped.

## ALCANCE VISUAL (SOLO admin)
- `/admin` → `AdminLogin.tsx` (`.auth-wrapper` + `.auth-card`) con toggle esquina.
- `/admin/panel` → `AdminDashboard.tsx` + tabs `ReservasTab`, `DashboardTab`,
  `GastosRedesTab` (`ReservasTab` y `GastosRedesTab` NO tienen colores
  hardcodeados en TSX; heredan todo de `styles.css`).
- Gráficos de `DashboardTab` (IncomeChart, EnergyChart, OccupancyChart) tienen
  hex fijos → se promueven a tokens `--chart-*` / `--sage`.

## PROHIBIDO (fuera de alcance)
- Portal huésped (`GuestLogin.tsx`, `GuestReservation.tsx`) y sus clases
  (`.guest-shell`, `.reservation-card`, `.detail-grid`, `.price-summary`,
  `.checkin-section`, `.door-access-*`, `.back-link`).
- Landing (`landing/`), `server/`, `agent/`, `scripts/`, compose, nginx,
  `litestream.yml`.
- Sync del tema a servidor / entre dispositivos (por dispositivo, `localStorage`).

## 1. DECISIÓN DE DISEÑO: tema oscuro AISLADO en admin

`.auth-wrapper`, `.auth-card`, `.badge`, `.alert`, `.btn`, `.field`, `table`,
`.alert` son clases **compartidas** entre admin y huésped. Si el toggle setea
`data-theme` en `<html>` y los overrides oscuros se escriben a nivel
`:root[data-theme='dark']`, el portal huésped podría verse oscuro si el mismo
dispositivo guardó la preferencia.

**Contramedida (obligatoria):** las clases oscuras se activan únicamente dentro
de un marcador propio de admin.

- `<html>` recibe `data-theme="dark|light"` (para el toggle y el script
  anti-FOUC) — pero SOLO en rutas admin.
- Todos los tokens oscuros y overrides se escriben con prefijo de contenedor
  admin: `:root[data-theme='dark'] .admin-theme { … }`.
- Frontend agrega la clase `admin-theme` (aditiva, NO afecta al huésped):
  - `AdminLogin.tsx` → `<div className="auth-wrapper admin-theme">`
  - `AdminDashboard.tsx` → `<div className="admin-shell admin-theme">`
- El portal huésped no tiene `.admin-theme` → jamás aplica oscuro.
- `color-scheme: dark` dentro del bloque admin (scrollbars/selects nativos).

**FOUC:** script inline en `app/index.html` setea `data-theme` ANTES de pintar
solo si `location.pathname.includes('/admin')` — guard portátil que cubre dev
(`/admin`) y staging (`/rr/app/admin`), y jamás es `true` en `/reserva`
(huésped). **Importante para frontend:** un script inline NO puede usar
`import.meta.env`; por eso se usa `includes('/admin')` en vez de comparar
contra `VITE_ADMIN_PATH` — así no hay prefijo que sincronizar a mano. Leer
`localStorage['rumihome.theme']==='dark'`.

**Limpieza:** `useTheme` elimina `data-theme` del documento al desmontar o al
salir de rutas admin: el huésped jamás hereda un estado dejado por un montaje
admin previo en la misma sesión SPA.

## 2. PALETA OSCURA (bloque de tokens)

Reemplazo de valores dentro de `:root[data-theme='dark'] .admin-theme` (los
nombres y la semántica de uso no cambian):

```css
:root[data-theme='dark'] .admin-theme {
  --bg: #161619;
  --dark: #F5F5F7;
  --text: #E6E6EA;
  --text-soft: #A1A1A6;
  --soft: #2C2C2F;
  --tile: #1C1C1F;
  --wood: #6B5433;
  --gray: #636366;
  --muted: #98989D;
  --accent: #FF385C;
  --accent-cta: #FF385C;
  --accent-dark: #FF5474;
  --sage: #5A745A;
  --sage-deep: #4C5E4C;
  --white: #1C1C1F;
  --on-accent: #FFFFFF;
  --error: #FF7A66;
  --chart-grid: #3A3A3F;
  --chart-green: #34C759;
  --chart-blue: #0A84FF;
  --chart-axis: #98989F;
  --chart-text: #F5F5F7;
  color-scheme: dark;
}
```

Y en `:root` (tema claro) se AGREGAN sin cambiar la luz:
`color-scheme: light;`, `--on-accent: #ffffff;` y los tokens `--chart-*`
(iguales a los hex actuales de los gráficos, para que la luz no cambie):
`--chart-grid:#E8E8ED; --chart-green:#008234; --chart-blue:#0071e3;
--chart-axis:#86868b; --chart-text:#1d1d1f;`.

### Contraste verificado (WCAG AA, normal text ≥ 4.5:1)
| Par | Ratio |
|---|---|
| `--text` #E6E6EA sobre `--bg` #161619 | ≈ 14.6:1 ✓ |
| `--text-soft` #A1A1A6 sobre superficie #1C1C1F | ≈ 6.6:1 ✓ |
| `--error` #FF7A66 sobre `.alert.error` bg | ≈ 6.0:1 ✓ |
| Texto #F5F5F7 sobre `.cal-day.ocupado` (sage #5A745A) | ≈ 4.7:1 ✓ |
| Texto #F5F5F7 sobre `.cal-day.parcial` (wood #6B5433) | ≈ 6.4:1 ✓ |
| Borde input `--gray` #636366 sobre `--bg` (UI 1.4.11 ≥ 3:1) | ≈ 3.0:1 ✓ |
| `--on-accent` blanco sobre `--accent-cta` #FF385C | ≈ 3.5:1 (brand heredado) |
| Barras ocupación `--sage` sobre `.dashboard-section` | distinguible ✓ |

### Por qué `--white` se "invierte"
En claro `--white` es superficie de tarjetas Y color del texto del CTA (`.btn`).
En oscuro `--white` pasa a ser la superficie `#1C1C1F`. Para no romper el texto
del CTA se introduce `--on-accent: #FFFFFF` y el `.btn` migra de
`color: var(--white)` a `color: var(--on-accent)` (en claro ambos valen blanco).

## 3. Overrides de colores hardcodeados (inventario)

Selectores que usan hex/rgba fijos en `styles.css` (ignoran tokens). Se
overridean TODOS bajo `:root[data-theme='dark'] .admin-theme …` (lista completa
en la implementación). Bloques cubiertos:
- Layout: `.admin-topbar` (bg rgba + borde).
- Botones: `.btn.danger` y hover.
- Alerts: `.alert.error/.ok/.info`.
- Tabla: `tbody td` borde, `tbody tr:hover`.
- Badges: `.pendiente/.confirmada/.cancelada/.finalizada`.
- Modal/backdrop y sombras de `.auth-card/.table-wrap/.stat-card/.calendar-section`.
- Calendario: `.cal-day`, `.cal-day.libre/.blank`, `.legend.libre`.
- Tabs: `.main-tab`, `.subtab`, `.subtabs`.
- Dashboard: `.dashboard-section`, `h4`, `.stat-card span.pos/.neg`,
  `.cat-list`, `.mini-table`, `.event-list`, `.key-dot`, `.muted`,
  `.inline-form`, `.draft-total`, `.hour-bar-fill`, `.hour-label`,
  `.pill-group/.pill/.pill.active`, `.device-card/.on/-info/-state/-seen`,
  `.stat-card.accent`, `.usage-bar`, `.usage-bar-fill`, `.key-badge.open`.
- Toolbar: `.toolbar .search`, `.calendar-head select` (fondo/placeholder).

### Gráficos SVG en `DashboardTab.tsx` (hex → tokens)
| Selector | Antes | Después |
|---|---|---|
| grilla (líneas) | `#E8E8ED` | `var(--chart-grid)` |
| barras ingresos / promedio / admin | `#008234` | `var(--chart-green)` |
| barras gastos / huésped | `#0071e3` | `var(--chart-blue)` |
| etiquetas de eje/textos secundarios | `#86868b` | `var(--chart-axis)` |
| texto principal gráficos | `#1d1d1f` | `var(--chart-text)` |
| barras ocupación | `#8CA18B` | `var(--sage)` |

### Guía de contraste para los overrides (obligatoria en implementación)
- Texto/etiquetas: **≥ 4.5:1** sobre su fondo (WCAG 1.4.3 AA).
- Inputs/bordes/UI/icons: **≥ 3:1** contra superficie adyacente (WCAG 1.4.11).
- Casos que necesitan valor propio en oscuro (el hex de luz no cumple):
  - `.stat-card span.pos` en claro es `#6B8767` (verde oscuro) → en oscuro usar
    un verde AA sobre `#1C1C1F`, p. ej. `#7CDB7C` ✓ (≈ 9:1).
  - `.stat-card span.neg` es `#FF385C` → sobre `#1C1C1F` da ≈ 4.8:1 ✓ (margen ajustado: mantener o aclarar a `#FF5474` si QA lo pide).
  - `.badge.pendiente/.confirmada/.cancelada` usan pares texto/fondo claros → en
    oscuro: fondo muy oscuro desaturado + texto AA (p. ej. pendiente `#FFD9A0`
    sobre `#3B2A10`, confirmada `#9DF0C0` sobre `#0F2E1C`, cancelada `#FFB4A6`
    sobre `#3A1510`; validar ratio ≥ 4.5:1).
- Los `--accent` (#FF385C) como color de marca en botón quedan como están
   (≈ 3.5:1) porque es CTA con peso/negrita y es la identidad visual heredada;
   su texto (`.btn`) usa `--on-accent` blanco.

## 4. Toggle (componente `ThemeToggle`)
- Botón circular **44×44 como área táctil** (cumple tap targets móviles; la
  luna/sol visible puede ser ~22px), ícono SVG: **sol** cuando está oscuro
  (acción → claro), **luna** cuando está claro (acción → oscuro).
- A11y: `role="switch"`, `aria-checked`, `aria-label` dinámico
  ("Cambiar a tema oscuro/claro"), `title`. Focus visible: lo cubre el outline
  global `--accent` (en oscuro, #FF385C sobre fondo #161619 ≈ 5.1:1 ✓).
- Login: `className="theme-toggle--corner"` (absoluto en `.auth-card`, arriba
  derecha a ~14px — **requiere `position: relative` en `.auth-card`**).
- Panel: en la topbar dentro de nuevo wrapper `.admin-topbar-actions`
  (toggle + whoami + cerrar sesión).
- Persistencia: `localStorage['rumihome.theme']`, `'light'` default (aprobado:
  NO leer `prefers-color-scheme`).

## 5. Criterios de aceptación
1. Se alterna claro ↔ oscuro con el botón en login y en las 3 pestañas.
2. La preferencia sobrevive recargas (se persiste, anti-FOUC sin flash).
3. El portal huésped en el MISMO dispositivo con preferencia oscura se ve claro:
   rutas guest sin `.admin-theme` ni `data-theme` en `<html>`
   (muestra la SPA entera en claro).
4. Todos los textos del área admin cumplen AA (≥ 4.5:1) y UI ≥ 3:1
   (se verifica visualmente en el staging).
5. Build `npm run build` sin errores.
6. El diff toca solo `app/` y docs `.rr/`.

---

## 6. REVISIÓN VISUAL (gate 2 — post-deploy a staging)

**Estado: PENDIENTE de deploy** (frontend aún no implementa — ver plan.md tarea 2).
Cuando el staging esté arriba, verifico el HTML real contra esta spec y escribo
el veredicto aquí. Checklist de la revisión:

- [ ] Toggle visible en `/rr/app/admin` (login, esquina superior derecha de la
      tarjeta) y en `/rr/app/admin/panel` (topbar, junto a "Administrador").
- [ ] Al recargar en oscuro: sin flash de tema claro (anti-FOUC pasó) y el
      `data-theme="dark"` está en `<html>` solo en rutas admin.
- [ ] `/rr/app/reserva` + `/rr/app/reserva/<pnr>` con preferencia oscura en el
      mismo navegador: SPA completamente clara (sin `.admin-theme`).
- [ ] Las 3 pestañas (Reservas, Dashboard, Gastos & Redes) legibles en oscuro;
      gráficos del Dashboard con tokens `--chart-*`/`--sage` (sin hex).
- [ ] Badges, alerts, inputs, modo focus visible y toggle con contraste AA.
- [ ] Móvil (≤ 640px): topbar no se desborda con toggle + whoami + logout;
      área táctil del toggle ≥ 44px.

Veredicto: _pendiente_.

**Ajustes menores aceptados (riesgo bajo, documentados):**
- Overscroll del body en móvil puede mostrar fondo `--bg` claro en zona
  elástica (el body no se oscurece porque es ajeno a `.admin-theme`). Se acepta:
  el overscroll se ve < 1s y no afecta lectura. Si Daniel lo ve molesto, se
  añade `:root[data-theme='dark'] body { background: #161619; }` en una
  iteración futura (no bloquea esta feature).