# Plan: REVERT QUIRÚRGICO — validación RUT SOLO (escenario 9)

## Orden de Daniel (escenario 9)
El staging (`/opt/rumihome-rr`, branch `rr-feature-9-revert-selectivo`) tiene **2 features
activas conviviendo**:
1. **Validación RUT chileno** (escenario 4) — `lib/rut.ts` (app y server), validación en
   `GuestLogin.tsx`, `guestRouter`/`adminRouter`.
2. **Gráfico de ocupación mensual** (escenario 8) — serie backend + SVG en `DashboardTab`.

DANIEL QUIERE: **revertir SOLO la validación RUT**. El gráfico de ocupación **DEBE
quedarse intacto**. Este documento es el plan quirúrgico (pm NO codea). NO se toca código
sin aprobación explícita de la tarea 1 de TAREAS.

## Estado verificado (git, rama `rr-feature-9-revert-selectivo` @ 6dad2ef)

| Feature | Commits | Archivos tocados |
|---|---|---|
| RUT (esc4) | `0710bd8` (frontend) + `dbc44d0` (backend) | `app/src/lib/rut.ts` (NUEVO), `app/src/pages/GuestLogin.tsx`, `server/src/lib/rut.ts` (NUEVO), `server/src/db/reservations.ts`, `server/src/routes/admin.ts` |
| Gráfico (esc8) | `51cbd50` (frontend) + `5a133ed` (backend) | `app/src/api/client.ts`, `app/src/pages/DashboardTab.tsx`, `app/src/types.ts`, `server/src/db/reservations.ts`, `server/src/routes/admin.ts` |

**Advertencia clave del escenario**: `server/src/db/reservations.ts` y
`server/src/routes/admin.ts` fueron tocados por **AMBAS** features. El revert no puede ser
un `git revert` ciego de los commits de RUT (anularía hunks del gráfico). Es un revert
**selectivo por hunk**.

## Estrategia quirúrgica

Restaurar cada archivo al blob de referencia que contiene SOLO la feature gráfico
(estado tras `5a133ed`/`51cbd50`), extrayendo únicamente los hunks RUT:

| Archivo | Estado objetivo (referencia git) |
|---|---|
| `app/src/pages/GuestLogin.tsx` | blob `904d2b4` (= estado previo a `0710bd8`, sin RUT; el gráfico nunca lo tocó) |
| `server/src/routes/admin.ts` | estado `5a133ed` del archivo (= solo gráfico: hay `getOccupancySeries` + `/occupancy/series`, SIN validarRut ni rutInvalido) — a partir de `f02360f` AÑADIR solo hunk ocupación |
| `server/src/db/reservations.ts` | estado `5a133ed` del archivo (= solo gráfico: hay `getOccupancySeries`, `guestLookup` ORIGINAL sin normalizarRut) |

Equivalente verifiable: el diff final de la rama debe ser **cero** contra
`rr`-con-gráfico-solo en los 3 archivos de código y sin residuos RUT en ningún lado.

---

## INVENTARIO EXACTO — LO QUE SE VA (feature RUT)

### 1. `app/src/lib/rut.ts` — **BORRAR archivo completo** (38 líneas)
- `RutErrorCode`, `ValidarRutResult`, `normalizarRut`, `calcularDv`, `validarRut`.
- Sin referencias restantes en la app después del revert (ver verificación 2).

### 2. `server/src/lib/rut.ts` — **BORRAR archivo completo** (38 líneas)
- Mismo contenido espejo (normalizarRut, validarRut, etc.).
- Sin referencias restantes en el server después del revert.

### 3. `app/src/pages/GuestLogin.tsx` — REVERTIR a blob `904d2b4`
Eliminar los hunks del commit `0710bd8`:
- `import { validarRut, type RutErrorCode } from '../lib/rut'`
- Constante `RUT_ERROR_MESSAGES`
- Estado `rutError` + `handleRutBlur`
- En `handleSubmit`: el early-return `if (!rut.trim()) return`, el bloque
  `validarRut`/`rutNormalizado`, el focus de `g-rut`; volver a enviar `rut.trim()`
  (y navegar con `rut: rut.trim()`)
- En el input `#g-rut`: `autoComplete="off"`, `aria-invalid`, `aria-describedby`,
  el `onBlur`, la mutación de `rutError` en `onChange`; restaurar
  `onChange={(e) => setRut(e.target.value)}`
- Bloque `{rutError && (<p id="rut-error" …>…)}`

### 4. `server/src/db/reservations.ts` — REVERTIR SOLO hunk RUT (archivo compartido)
- BORRAR: `import { normalizarRut } from '../lib/rut.js'` (línea 5)
- `guestLookup` (líneas ~359-366): restaurar SQL y parámetro ORIGINALES
  ```ts
  WHERE UPPER(pnr) = ? AND guest_rut = ?
  ```
  y `.get(pnr.toUpperCase(), rut.trim())`
  (quitar el `REPLACE(REPLACE(...))` y `normalizarRut(rut)`)
- **NO TOCAR** `OccupancyMonth` ni `getOccupancySeries` (hunk del gráfico, líneas ~437-490).

### 5. `server/src/routes/admin.ts` — REVERTIR SOLO hunks RUT (archivo compartido)
- BORRAR: `import { validarRut } from '../lib/rut.js'` (línea 2)
- BORRAR helper `rutInvalido` (líneas ~22-24)
- BORRAR los **5 checks** `validarRut`/`rutInvalido`:
  1. `POST /reservations` (tras el chequeo de obligatorio, líneas ~34-35)
  2. `PATCH /reservations/:id` (dentro del `if (b.guest_rut !== undefined)`, líneas ~130-132)
  3. `guestRouter POST /lookup` (líneas ~199-200)
  4. `guestRouter POST /reservation` (líneas ~215-216)
  5. `guestRouter PATCH /reservation` (líneas ~230-231)
- **NO TOCAR**: import de `getOccupancySeries` ni el endpoint `GET /occupancy/series`
  (hunk del gráfico, rutas ~90-103).

---

## INVENTARIO EXACTO — LO QUE QUEDA INTACTO (feature gráfico, NO REVERTIR)

### 6. `app/src/pages/DashboardTab.tsx` — **INTACTO**
- `import type { OccupancySeries }`
- Componente `OccupancyChart` (SVG, eje Y 0-100)
- Estado `occ`, `load()` con `Promise.all([…, api.getOccupancySeries(6, propertyId).catch(() => null)])`
- Sección "Ocupación mensual (6 meses)" dentro del nuevo `dashboard-cols` junto a
  "Ingresos vs gastos (6 meses)"

### 7. `app/src/api/client.ts` — **INTACTO**
- `getOccupancySeries(months, propertyId)` + `import type { OccupancySeries }`

### 8. `app/src/types.ts` — **INTACTO**
- Interfaces `OccupancyMonth` y `OccupancySeries`

### 9. `server/src/db/reservations.ts` — **INTACTO en hunk gráfico**
- Interface `OccupancyMonth` + función `getOccupancySeries` (compartido con RUT: solo
  se revierte el hunk del punto 4)

### 10. `server/src/routes/admin.ts` — **INTACTO en hunk gráfico**
- Endpoint `GET /occupancy/series` + su import (compartido con RUT: solo se revierten
  los hunks del punto 5)

---

## Resumen visual de archivos

| Archivo | Acción |
|---|---|
| `app/src/lib/rut.ts` | ✂️ BORRAR (RUT) |
| `server/src/lib/rut.ts` | ✂️ BORRAR (RUT) |
| `app/src/pages/GuestLogin.tsx` | ✂️ REVERTIR completo a blob `904d2b4` (RUT) |
| `server/src/db/reservations.ts` | 🔧 REVERTIR hunk `guestLookup`+import / ✅ MANTENER `getOccupancySeries` |
| `server/src/routes/admin.ts` | 🔧 REVERTIR import `validarRut`+`rutInvalido`+5 checks / ✅ MANTENER `/occupancy/series` |
| `app/src/pages/DashboardTab.tsx` | ✅ INTACTO |
| `app/src/api/client.ts` | ✅ INTACTO |
| `app/src/types.ts` | ✅ INTACTO |

## NO se toca (esta orden)
- `.rr/*` históricos (`ux-rut.md`, `qa-veredicto.md` del esc4, docs del esc8): los docs
  del proceso NUNCA se revierten. Este plan reemplaza el `plan.md` del esc4 — el resto
  queda como historial.
- `app/tsconfig.tsbuildinfo` (artefacto del build, tocado por esc8) — no es código de
  feature, se deja.
- `landing/`, `agent/`, `agent-dev/`, `litestream.yml`, `scripts/`, auth Firebase,
  infra compose/nginx, DBs de staging.

## RUTEO (reglas del entorno RR)
- **pm**: APLICA — este documento (no codea).
- **supervisor**: APLICA — audita que el revert NO haya arrancado hunks del gráfico y
  no haya tocado infra.
- **ux**: NO emite spec nueva (se restaura UX ya spec'ada del pre-RUT; revisión visual
  post-deploy queda en QA). Si QA detecta deriva visual en `GuestLogin`, escala.
- **frontend**: APLICA — puntos 1, 3 y build de `app/` (`npm run build`).
- **backend**: APLICA — puntos 2, 4, 5 y build/typecheck de `server/` + smoke contra
  SQLite de staging.
- **qa**: APLICA (siempre) — verificación anti-residuos, diff vs estado objetivo,
  pruebas funcionales, veredicto GO/NO-GO.

## TAREAS
1. **Confirmación previa** (regla backlog): pedir OK de Daniel sobre esta tarea
   específica ("revertir SOLO validación RUT") ANTES de editar cualquier archivo de código.
   - Estado: EN ESPERA DE OK

2. [backend] Revert hunk RUT en `server/src/db/reservations.ts` (punto 4)
   - Estado: pendiente

3. [backend] Revert hunks RUT en `server/src/routes/admin.ts` (punto 5) + borrar
   `server/src/lib/rut.ts` (punto 2)
   - Estado: pendiente

4. [backend] `npm run typecheck` + `npm run build`; smoke: `guestLookup` matchea
   reserva histórica con RUT con/sin puntos, y `GET /api/occupancy/series` responde
   200 con el payload esperado.
   - Estado: pendiente

5. [frontend] Revert `app/src/pages/GuestLogin.tsx` (punto 3) + borrar
   `app/src/lib/rut.ts` (punto 1)
   - Estado: pendiente

6. [frontend] `npm run build` en `app/`.
   - Estado: pendiente

7. [qa] Verificación anti-colateral (CRITERIOS DE ÉXITO, ver abajo) + veredicto en
   `.rr/qa-veredicto.md`.
   - Estado: pendiente

8. [pm] Registrar cierre y dejar listo para deploy staging (NO promote sin "APROBAR").
   - Estado: pendiente

## CRITERIOS DE ÉXITO (automáticos, lista de chequeo QA)
1. **Residuos cero de RUT**: `grep -rn "normalizarRut\|validarRut\|RutErrorCode\|lib/rut" app/src server/src` → **0 matches**.
2. **Diff del gráfico intacto**: `git diff` de `DashboardTab.tsx`, `api/client.ts`,
   `types.ts` vs `5a133ed`/`51cbd50` → **vacío**.
3. **Diff de archivos compartidos**: `git diff 5a133ed` sobre `admin.ts` y
   `reservations.ts` → **vacío** (identidad exacta con el "solo gráfico").
4. **`GuestLogin.tsx`** idéntico al blob `904d2b4` (`git diff` contra `0710bd8^` → vacío).
5. Build app + server limpios; smoke staging: login huésped con RUT sin puntos entra
   (lookup original), gráfico de ocupación se renderiza en `/admin`.

## HISTORIAL / DECISIONES
- **Escenario 9** (revert selectivo): se elige revert por **hunk** (no commit completo)
  porque `reservations.ts` y `admin.ts` están compartidos con la feature gráfico.
- La comparación RUT vuelve a igualdad simple `guest_rut = ?` + `rut.trim()` (estado
  funcional previo al esc4). No se migra/normaliza datos.
- `validarRut` deja de existir en app y server; ningún endpoint lo vuelve a exigir.
- El gráfico de ocupación (esc8) permanece íntegro e intocado: serie backend
  `getOccupancySeries`, endpoint `GET /api/occupancy/series`, `OccupancyChart` SVG,
  sección en Dashboard y tipos.
- Commits sugeridos (estilo historial `rr(<scope>):`):
  - `rr(backend): revert validacion RUT (queda grafico ocupacion intacto)`
  - `rr(frontend): revert validacion RUT en portal huesped`
  - `rr(train): docs escenario 9 (plan reversion, veredicto QA)`