# UX Spec — Modo oscuro en el panel `/admin`

**Fecha:** 2026-09-19
**Branch:** rr (feature 1)
**Rol:** ux (spec ANTES de codificar — gate doble)
**Feature:** plan.md tarea 1 → dark mode SOLO en el área admin de la SPA (`app/`).
**Estado:** asignada a ux (2026-09-19)

## Fuente de verdad
1. `app/src/styles.css` — tokens `:root` (líneas 1–18) + patrones visuales de la SPA.
2. `app/src/pages/AdminLogin.tsx`, `AdminDashboard.tsx`, `DashboardTab.tsx` — estructura donde montar el toggle y colores SVG hardcodeados.
3. plan.md — supuestos aprobados por Daniel (por dispositivo, toggle en login, default claro).

## ALCANCE VISUAL (SOLO admin)
- `/admin` → `AdminLogin.tsx` (login, `.auth-wrapper` + `.auth-card`).
- `/admin/panel` → `AdminDashboard.tsx` + tabs `ReservasTab`, `DashboardTab`, `GastosRedesTab` (todas las clases bajo `.admin-shell`).
- Persistencia client-side (`localStorage` `rumihome.theme`).

## PROHIBIDO (fuera de alcance)
- Portal huésped (`GuestLogin.tsx`, `GuestReservation.tsx`) y sus clases (`.guest-shell`, `.reservation-card`, `.detail-grid`, `.price-summary`, `.checkin-section`, `.door-access-*`, `.back-link`).
- Landing (`landing/`), `server/`, `agent/`, `scripts/`, compose, nginx, `litestream.yml`.
- Sync del tema a servidor / entre dispositivos (supuesto 1 aprobado: `localStorage` por dispositivo).

---

## 1. DECISIÓN DE DISEÑO: tema oscuro AISLADO en admin (no contamina huésped)

`.auth-wrapper`, `.auth-card`, `.badge`, `.alert`, `.btn`, `.field` son clases **compartidas** entre admin y huésped. Si el toggle setea `data-theme` en `<html>` y los overrides oscuros se escriben a nivel `:root[data-theme='dark']`, el portal huésped — que SIEMPRE es claro — podría verse oscuro si el mismo dispositivo guardó la preferencia (supuesto 1: por dispositivo).

**Contramedida (obligatoria):** las clases oscuras se activan únicamente dentro de un marcador propio de admin.

- `<html>` recibe `data-theme="dark|light"` (para que el toggle y el script anti-FOUC lean la preferencia sin depender del componente).
- Los tokens y todos los overrides oscuros se escriben con prefijo de contenedor admin:

```css
:root[data-theme='dark'] .admin-theme { /* paleta oscura */ }
:root[data-theme='dark'] .admin-theme .admin-topbar { /* overrides hardcodeados */ }
```

- Frontend agrega la clase `admin-theme` (puramente aditiva, NO afecta a huésped):
  - `AdminLogin.tsx` → `<div className="auth-wrapper admin-theme">`
  - `AdminDashboard.tsx` → `<div className="admin-shell admin-theme">`
- El portal huésped no tiene `.admin-theme` → jamás aplica oscuro, sin importar la preferencia del dispositivo.
- Dentro del bloque oscuro se define `color-scheme: dark` (scrollbars, selects y widgets nativos se ven oscuros; al huésped no le aplica).

**FOUC:** `data-theme` en `<html>` se setea ANTES de pintar (script inline en `app/index.html` leyendo `localStorage['rumihome.theme']`). Los tokens solo se activan cuando React monta `.admin-theme` (montaje síncrono, rápido); no hay flash de fondo en el huésped porque allá el prefijo nunca coincide.

---

## 2. PALETA OSCURA (bloque de tokens)

Reemplazo de valores dentro de `:root[data-theme='dark'] .admin-theme` (los nombres y la semántica de uso no cambian; solo el valor de cada token):

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
  --error: #FF7A66;
  --on-accent: #FFFFFF;
  color-scheme: dark;
}
```

Y en el `:root` actual (tema claro), AGREGAR los tokens nuevos que faltan para que la luz no cambie:

```css
:root {
  /* ... tokens actuales intactos ... */
  --on-accent: #FFFFFF; /* NUEVO: texto sobre CTA (antes var(--white)) */
}
```

### Contraste verificado (WCAG AA, normal text ≥ 4.5:1)
| Par | Ratio |
|---|---|
| `--text` #E6E6EA sobre `--bg` #161619 | ≈ 14.6:1 ✓ |
| `--text-soft` #A1A1A6 sobre superficie #1C1C1F | ≈ 6.6:1 ✓ |
| `--error` #FF7A66 sobre `.alert.error` bg | ≈ 6.0:1 ✓ |
| Texto #F5F5F7 sobre `.cal-day.ocupado` (sage #5A745A) | ≈ 4.7:1 ✓ |
| Texto #F5F5F7 sobre `.cal-day.parcial` (wood #6B5433) | ≈ 6.4:1 ✓ |
| Borde input `--gray` #636366 sobre `--bg` (UI 1.4.11 ≥ 3:1) | ≈ 3.0:1 ✓ |
| `--accent-dark` #FF5474 sobre fondo oscuro (hover CTA) | legible ✓ |
| Blanco `--on-accent` sobre `--accent-cta` #FF385C | ≈ 3.5:1 (brand heredado, igual a la luz; ver Banderas) |

### Por qué `--white` se "invierte" a superficie
En la paleta actual `--white` cumple DOS roles: superficie de tarjetas (`.table-wrap`, `.stat-card`, `.auth-card`, `.modal`, inputs) y texto sobre el CTA (`.btn`). En oscuro, `--white` pasa a ser la superficie `#1C1C1F`. Para NO romper el texto del CTA se introduce **`--on-accent: #FFFFFF`** y el `.btn` se migra de `color: var(--white)` a `color: var(--on-accent)` (1 sola regla; en claro ambos valen blanco → sin cambio visual). El `.btn.danger` también se override en oscuro (ver §3).

---

## 3. Overrides de colores hardcodeados (inventario completo)

Estos selectores usan hex/rgba fijos que IGNORAN los tokens y siguen "claros" en oscuro. Se overridean TODOS bajo `:root[data-theme='dark'] .admin-theme …`:

### Layout / topbar
```css
.admin-topbar {
  background: rgba(28,28,31,0.78);
  border-bottom-color: rgba(255,255,255,0.08);
}
```

### Alerts
```css
.alert.error { background: #3A1C1E; border-color: #7A3030; }   /* color: var(--error) ya aplica */
.alert.ok    { background: #1E3A27; color: #8FD9A8; border-color: #2E5C3E; }
.alert.info  { background: var(--soft); border-color: var(--gray); }
```

### Badges
```css
.badge.pendiente { background: #3A2A14; color: #E8B060; }
.badge.confirmada{ background: #1E3A27; color: #8FD9A8; }
.badge.cancelada { background: #3A1D1A; color: #F09B7A; }
.badge.finalizada{ background: var(--soft); color: var(--text-soft); } /* ya token */
```

### Tablas
```css
tbody td { border-color: var(--soft); }
tbody tr:hover { background: #232327; }
.table-wrap { box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
```

### Tabs
```css
.main-tab { color: var(--text-soft); }
.main-tab:hover { color: var(--dark); }
.main-tab.active { background: var(--soft); color: var(--dark); }
.subtabs { border-bottom-color: var(--soft); }
.subtab { color: var(--text-soft); }
.subtab:hover { color: var(--dark); }
.subtab.active { color: var(--accent); border-bottom-color: var(--accent); } /* idéntico a luz */
```

### Dashboard / Gastos (tarjetas, listas, tablas mini, inline)
```css
.dashboard-section { background: var(--white); border-color: var(--soft); box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
.dashboard-section h4 { color: var(--dark); }
.cat-list li { border-bottom-color: var(--soft); }
.cat-list small, .mini-table th { color: var(--text-soft); }
.mini-table th, .mini-table td, .event-list li { border-color: var(--soft); }
.event-list small, .muted { color: var(--muted); }
.inline-form { background: #212126; border-color: var(--soft); }
.draft-total { color: var(--dark); }
.stat-card span.pos, .stat-card .stat-small.positive, .device-state.on, .key-badge.open { color: #8FD9A8; }
.usage-bar { background: var(--soft); }
.key-dot { background: var(--muted); }
.key-dot.open { background: #33A852; }
.device-card { background: #232327; border-color: var(--soft); }
.device-card.on { border-color: #33A852; }
.device-info small, .device-state, .device-seen, .hour-label { color: var(--muted); }
.stat-card.accent { border-left-color: var(--accent); } /* idéntico a luz */
```

### Pill group (períodos domótica)
```css
.pill-group { background: #27272B; }
.pill { color: var(--text-soft); }
.pill.active { background: #3A3A3F; color: var(--dark); box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
```

### Calendario
```css
.cal-day, .cal-day.libre { background: #2A2A2E; border-color: var(--soft); }
.legend.libre::before { background: #2A2A2E; }
```
`.cal-day.parcial` (bg `var(--wood)`) y `.cal-day.ocupado` (bg `var(--sage)`) se adaptan solos vía tokens; su texto usa `var(--dark)` → claro ✓.

### Modal
```css
.modal-backdrop { background: rgba(0,0,0,0.55); }
.modal { box-shadow: 0 16px 40px rgba(0,0,0,0.45); }
```

### Formularios / selects nativos
```css
.toolbar .search, .calendar-head select { background: var(--white); color: var(--text); }
.toolbar .search::placeholder { color: var(--text-soft); }
```

### Botones
```css
.btn { color: var(--on-accent); }               /* MIGRACIÓN global (1 línea) */
.btn.danger { background: #A6402E; color: var(--on-accent); }
.btn.danger:hover { background: #8C3322; }
```

### Stats / sombras de tarjetas
```css
.stat-card, .calendar-section { box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
```

---

## 4. Colores SVG en `DashboardTab.tsx` (gráficos)

Los `fill`/`stroke` inline de los charts NO los cubre CSS. Migrarlos a variables CSS que el SVG lea por estilo (presentación), con valores por tema. Frontend reemplaza los atributos por `style={{ fill: 'var(--...)', stroke: … }}`:

| Hex actual | Rol | Token oscuro |
|---|---|---|
| `#E8E8ED` | gridlines (income/energy) | `var(--soft)` |
| `#86868b` | ejes, ticks, fechas, iconos secundarios | `var(--muted)` |
| `#1d1d1f` | etiquetas de texto (Ingresos/Gastos, Huésped/Admin, totales) | `var(--text)` |
| `#008234` | barras ingresos + línea promedio + leyenda | `#2EBB62` |
| `#0071e3` | barras gastos/huésped + leyenda | `#4C9BFF` |
| `#86868b` (barra apilada admin) | barra "Admin" | `var(--muted)` |

Los colores de marca (#FF385C, #5ac8fa del `usage-bar-fill`) se mantienen tal cual en ambos temas.

---

## 5. Componente `ThemeToggle.tsx`

**Ubicación (2 mounts):**
1. **Panel:** dentro del grupo derecho de `.admin-topbar`, ANTES del `span.whoami`, alineado a la derecha.
2. **Login (supuesto 2 aprobado):** fijo en la esquina superior derecha del viewport (`position: fixed; top: 1rem; right: 1rem; z-index: 60`), visible sobre el gradiente del auth-wrapper.

**Markup y accesibilidad (patrón button con aria):**
```tsx
<button
  type="button"
  className="theme-toggle"
  aria-pressed={theme === 'dark'}
  aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
  title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
  onClick={toggleTheme}
>
  {/* SVG 20x20: luna (oculto cuando dark con aria-hidden) / sol */}
</button>
```
- Icono: inline SVG (sin fuentes emoji). En luz se muestra la **luna** (activar oscuro); en oscuro el **sol** (activar claro). `<span className="sr-only">` con el texto de la acción para lectores.
- `aria-pressed={theme === 'dark'}` refleja el estado real; la etiqueta describe la acción.

**Estilos (base, ambos temas):**
```css
.theme-toggle {
  width: 40px; height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--soft);
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
  transition: background .15s, color .15s, transform .15s, border-color .15s;
}
.theme-toggle:hover { background: var(--soft); color: var(--text); }
.theme-toggle:active { transform: scale(.92); }
.theme-toggle svg { width: 20px; height: 20px; }
```
- Foco visible: ya cubierto por el `:focus-visible` global de `:is(a, button, ...)` (outline 3px var(--accent)) — no agregar otro.
- En el panel, margen derecho `0.5rem` para separarlo del `whoami`.

---

## 6. Persistencia y anti-FOUC (contrato con frontend)

- Clave: `rumihome.theme`, valores `light` | `dark`. Default `light` (supuesto 3).
- Hook `app/src/hooks/useTheme.ts`: estado inicial leído de `localStorage`, expone `{ theme, toggleTheme }`; escribe `localStorage` y sincroniza `document.documentElement.dataset.theme` en todo cambio.
- Script inline en `app/index.html` (antes de `/src/main.tsx`): lee `localStorage['rumihome.theme']` y, si es `dark`, setea `document.documentElement.dataset.theme = 'dark'` antes de pintar (evita flash de fondo). Si no hay nada, no toca nada (default claro).
- Ninguna lógica de tema en `main.tsx`/router: el alcance se garantiza por el prefijo `.admin-theme` (§1), no por React.

---

## 7. CRITERIOS DE ACEPTACIÓN (para frontend y gate QA)
1. El toggle (`aria-pressed`, `aria-label`, focus visible, hover, active) se ve y funciona en login y en los 3 tabs del panel.
2. Claro↔oscuro aplica al instante en toda el área admin (login + panel + tabs) y persiste tras recarga y navegación entre tabs.
3. El portal huésped (`/reserva`) se ve SIEMPRE claro, incluso si el dispositivo tiene `rumihome.theme=dark` guardado (verificación manual en el mismo browser).
4. Contraste AA en ambos temas (tabla §2); nada ilegible: grids SVG, badges, alerts, tablas, calendario, modal.
5. Sin flash de tema al cargar admin.
6. `npm run build` OK; `git diff` confinado a `app/*` y `.rr/*`.
7. Revisión visual de ux en staging `/rr/app/admin` y `/rr/app/admin/panel` (gate doble) antes del veredicto QA.

## 8. PERMISOS DE PROMOCIÓN
Nuevo comportamiento de UI: se promueve a prod SOLO con "APROBAR" de Daniel tras ver staging en claro y oscuro.

## 9. BANDERAS PARA DANIEL (decisiones visibles)
- **Blindaje por `admin-theme`**: el huésped queda 100% claro aunque el mismo dispositivo tenga oscuro guardado (decisión de scope estricta del plan; alternativa más simple —tema global en huésped— fue descartada por "NO entrar").
- **`--white` cambia de rol en oscuro** (pasa a superficie #1C1C1F) + nuevo token `--on-accent` para el texto del CTA: no hay cambio visual en claro, habilita el oscuro sin refactor masivo.
- **Contraste del CTA**: blanco sobre #FF385C mantiene ~3.5:1 (como hoy en claro, brand heredado). Se conserva idéntico; no se introducen regresiones.
- **Veredes de marca en gráficos** se reemplazan por tonos más luminosos en oscuro (#2EBB62 / #4C9BFF) para legibilidad; el resto de la paleta de marca es idéntica (accent/sage/wood adaptados por token).