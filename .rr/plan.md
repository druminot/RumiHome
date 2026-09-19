# Plan: Validación RUT chileno en portal huésped /reserva (escenario 4)

## Orden de Daniel (escenario 4)
Agregar validación de RUT chileno en el formulario del portal huésped (`/reserva`):
formato + dígito verificador (módulo 11). Tanto en frontend como en el endpoint
backend. Mostrar mensaje de error claro si es inválido. NO codear en la sesión del
pm — este documento es el entregable de ruteo y planificación.

## Contexto (verificado en código)
- Formulario objetivo: `app/src/pages/GuestLogin.tsx` — el "formulario de reserva"
  del huésped es el lookup PNR + RUT (`/reserva`). El RUT se envía crudo
  (`rut.trim()`) a `POST /api/guest/lookup` vía `app/src/api/client.ts`.
- Endpoints backend que reciben `rut` (`server/src/routes/admin.ts`):
  - `guestRouter` (públicos, factor de auth del huésped): `POST /guest/lookup`,
    `POST /guest/reservation`, `PATCH /guest/reservation` — hoy solo validan no vacío.
  - `adminRouter`: `POST /reservations` (crear — RUT obligatorio, sin más checks) y
    `PATCH /reservations/:id` (permite cambiar `guest_rut` sin validar).
- `guestLookup(pnr, rut)` en `server/src/db/reservations.ts:350` compara por
  igualdad exacta `guest_rut = ?`. El formato almacenado varía (con/sin puntos,
  guión), por lo que validar formato estricto puede romper el matching de datos
  históricos.
- No existe ninguna validación de RUT en el repo (ni app, ni server, ni scripts).
- Estructura: el server es TS (`npm run build` = `tsc`, `typecheck` = `tsc --noEmit`),
  corre en Docker (`docker-compose.rr.yml` api-rr). `server/dist` y `node_modules`
  están en .gitignore. `app/` es Vite (`npm run build`).
- Rutas admin: la tabla `reservations.guest_rut` guarda el RUT del pasajero; el
  huésped se autentica con PNR + RUT. Un RUT inválido creado en admin haría
  imposible (o trivial) ese factor de auth.

## ACLARACIÓN de alcance (duda registrada, NO bloquea)
- Los labels actuales dicen "RUT / DNI". Con validación ESTRICTA de RUT chileno,
  huéspedes extranjeros con DNI (pasaporte) quedarían bloqueados del lookup.
  - DECISIÓN por defecto: cumplir el pedido literal (RUT chileno, módulo 11).
  - Si Daniel quiere admitir DNI extranjero, se relaja el formato (el campo sigue)
    — cambio de 1 línea documentado aquí para futuro.
- El formulario admin (`ReservasTab.tsx`) también ingresa RUT al crear reservas.
  Se valida en BACKEND (integridad del dato), pero el scope visual/frontend pedido
  es solo el portal huésped. La validación visual del form admin queda como
  backlog opcional (anotado en TAREAS).

## LÍNEA FRONTERA: qué se toca y qué NO

### Sí se toca
| Área | Archivos |
|---|---|
| backend | `server/src/routes/admin.ts` (guestRouter + adminRouter), `server/src/db/reservations.ts` (lookup normalizado) + **nuevo** `server/src/lib/rut.ts` |
| frontend | `app/src/pages/GuestLogin.tsx` + **nuevo** `app/src/lib/rut.ts` (espejo del algoritmo) |
| docs proceso | `.rr/ux-rut.md` (spec), `.rr/qa-veredicto.md`, este plan |

### NO se toca (prohibido/descartado)
- `landing/`, `agent/`, `litestream.yml`, `scripts/promote.sh`, `scripts/rollback.sh`.
- Middleware de auth Firebase (`server/src/middleware/auth.ts`, `firebase-admin.ts`).
- Migración masiva de datos ni bases de prod. NO se reescribe `guest_rut` histórico:
  la compatibilidad se resuelve con comparación normalizada en el lookup.
- `app/src/pages/ReservasTab.tsx` (visual) — queda como backlog opcional.

## Algoritmo (especificación única para app y server)
`validarRut(input: string): { ok: boolean; normalizado: string; error?: string }`
1. **Normalizar**: eliminar puntos, espacios y guión; upper; DV `k` → `K`.
   Ej: `12.345.678-4` → `123456784`; `11.111.111-1` → `111111111`.
2. **Formato**: deben quedar 2 a 9 caracteres alfanuméricos; el último es el DV
   (dígito 0-9 o `K`); el cuerpo (todo menos el último) debe ser 1 a 8 dígitos.
   Cualquier otra cosa → error de FORMATO.
3. **Dígito verificador (módulo 11)**: pesos [2,3,4,5,6,7] cíclicos sobre el cuerpo
   de derecha a izquierda. `suma = Σ (dígito × peso)`. `resto = suma % 11`.
   `dv = 11 - resto`; si `dv = 11` → `0`; si `dv = 10` → `K`.
   Comparar con el DV ingresado → si difiere, error de DÍGITO VERIFICADOR.
4. **Estructura de salida**: `normalizado` en formato canónico `12345678-4` / `11111111-K`.
5. Formato inválido explícito → NO calcular DV (error claro separado de "DV no coincide").

Norma de sincronía: `app/src/lib/rut.ts` y `server/src/lib/rut.ts` son funciones
puras idénticas (no hay paquete compartido entre app/server). QA debe diff-arlas.

## RUTEO (reglas del entorno RR)
- **pm**: APLICA — este plan (no codea).
- **supervisor**: APLICA — audita que el cambio NO toque infra, auth ni agents.
- **ux**: APLICA (UI+datos → ux+frontend+backend; cambio de formulario con mensajes
  de error). Emite spec `.rr/ux-rut.md` antes de codificar y revisa el staging
  post-deploy (gate doble).
- **frontend**: APLICA — validación en `GuestLogin.tsx` + `app/src/lib/rut.ts`;
  `npm run build` debe pasar.
- **backend**: APLICA — `server/src/lib/rut.ts`, validación en guestRouter +
  adminRouter, lookup con normalización; `npm run build` y smoke test contra SQLite staging.
- **qa**: APLICA (siempre) — diff, build limpio, casos de prueba, veredicto GO/NO-GO.
- **backlog (NO en este escenario)**: validación visual del form admin, admisión
  opcional de DNI extranjero, limpieza de RUTs históricos no normalizados.

## TAREAS
1. [ux] Spec `.rr/ux-rut.md` (antes de codificar)
   - Mensaje de error claro inline bajo el campo RUT, usando `.field` + `.alert error`
     existentes (sin estilos nuevos) + `role="alert"`/aria-invalid.
   - Constate de sintaxis: hint del placeholder `12.345.678-9`; diferencias de copy
     entre "formato inválido" y "dígito verificador no coincide"; maxLength y
     normalización de puntos/guiones al escribir (recomendación, no obligatorio).
   - El botón queda activo pero el submit se bloquea mostrando el error inline.
   - Estado: pendiente

2. [backend] Crear `server/src/lib/rut.ts`
   - Funciones puras `normalizarRut`, `calcularDv` y `validarRut` según el algoritmo.
   - Estados de error: `RUT_INVALIDO_FORMATO` y `RUT_INVALIDO_DV`.
   - Estado: pendiente

3. [backend] Validar en `guestRouter` (`admin.ts`)
   - `POST /guest/lookup`, `POST /guest/reservation`, `PATCH /guest/reservation`:
     antes del lookup, `validarRut(rut)`; si no ok → `400 { error: 'RUT inválido:
     verifica el formato y el dígito verificador' }` (mensaje claro, no genérico).
   - Enviar el RUT **normalizado** a `guestLookup` (compatibilidad de matching).
   - Estado: pendiente

4. [backend] Validar y normalizar en `adminRouter`
   - `POST /reservations`: si `guest_rut` no pasa `validarRut` → 400 con el mismo
     mensaje claro; guardar en la DB el RUT **normalizado** (`12345678-4`).
   - `PATCH /reservations/:id`: aplicar la misma validación cuando cambia `guest_rut`.
   - Estado: pendiente

5. [backend] Lookup con normalización (`db/reservations.ts`)
   - `guestLookup` debe comparar por RUT normalizado (sin puntos/guiones/espacios,
     upper) para no romper matching de filas históricas con formatos mixtos.
   - NO migrar datos; limpieza normalizada queda como backlog.
   - Estado: pendiente

6. [backend] Build y smoke test
   - `npm run typecheck` y `npm run build` en `server/` sin errores.
   - Smoke contra SQLite de staging (`data/rumihome.db`): crear reserva con RUT
     válido (200/201), con RUT de DV malo (400), con formato corrupto (400); lookup
     huésped con RUT con y sin puntos (debe matchear).
   - Estado: pendiente

7. [frontend] Crear `app/src/lib/rut.ts` (espejo idéntico del algoritmo backend)
   - Estado: pendiente

8. [frontend] Validar en `GuestLogin.tsx`
   - Validar `rut` antes de llamar a `api.guestLookup`; si inválido → mensaje de
     error inline claro bajo el campo (spec ux) y NO llamar al endpoint.
   - Mantener el flujo actual para rut válidos (normalizar antes de navegar al detalle).
   - Estado: pendiente

9. [frontend] Build
   - `npm run build` en `app/` sin errores.
   - Estado: pendiente

10. [qa] Pruebas funcionales + veredicto `.rr/qa-veredicto.md`
    - Vectores (algoritmo módulo 11): `11.111.111-1` (válido), `12.345.678-4`
      (válido DV=4), DV erróneo sobre el mismo cuerpo (p.ej. `12.345.678-9`),
      `K` mal ubicado, formato corto/largo, vacío, con puntos/guiones mixtos.
      El fixture definitivo lo calcula QA con el propio algoritmo; ambos `lib/rut.ts`
      deben ser idénticos.
    - Flujo E2E en staging: login huésped con RUT válido → entra; con DV malo →
      error inline (frontend) sin request; con formato corrupto → error claro.
    - Criterio GO: build app y server limpios, diff dentro de la línea frontera,
      veredicto escrito.
    - Estado: pendiente

11. [pm] Registrar cierre
    - Actualizar DESVIACIONES/historial y confirmar que infra (compose, nginx,
      agents, litestream) quedó intacta. NO hay promote sin "APROBAR" de Daniel.
    - Estado: pendiente

## HISTORIAL / DECISIONES
- Escenarios previos: docs `.rr/*` del proceso NUNCA se revierten (historial).
- Duda resuelta por defecto: validación ESTRICTA de RUT chileno (pedido literal).
  Si Daniel solicita admitir DNI extranjero, se relaja el formato en el mismo `validarRut`.
- La validación es QUIETO-VALIDA en frontend (bloquea submit con mensaje) y
  HARD-400 en backend (el cliente nunca debe confiar solo en el frontend).
- Commit sugeridos (estilo historial `rr(<scope>):`):
  - `rr(backend): validacion RUT chileno (modulo 11) en endpoints y lookup normalizado`
  - `rr(frontend): validacion RUT en formulario huesped /reserva`
  - `rr(train): docs escenario 4 (spec ux, veredicto qa)`