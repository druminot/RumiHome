# Plan: Campo teléfono del huésped (escenario 5 — MIGRACION DB)

## Orden de Daniel (escenario 5 — guest_phone)
Agregar el campo telefono del huesped a las reservas:
1. Nueva columna `guest_phone` en la tabla `reservations` (SQLite staging).
2. Campo en el formulario de reserva del portal huesped.
3. Persistencia en los endpoints correspondientes.

Requisito critico (orden explicita):
- Verificar que `/root/backups/scenario-5-pre.db` existe (fuera del sandbox: NO se lee su contenido, solo se confirma su presencia — declarado por Daniel).
- Hacer backup PROPIO en `.rr/db-pre-migracion.db` ANTES de tocar la DB.
- La migracion NUNCA debe destruir datos: verificar conteo de reservas ANTES y DESPUES.
- Entregable del PM: ruteo + plan en `.rr/plan.md`. **pm NO codea.**

## Estado verificado (linea base escenario 5)
- `HEAD` = `fb8cbbf` = `origin/rr` = `scenario-5-base` (idem lineas base escenarios anteriores). Working tree limpio salvo `.rr/plan.md` (este doc). Branch actual: `rr-feature-5-telefono`.
- Sin `.rr/HALT`.
- `/root/backups/scenario-5-pre.db` EXISTE (listado en `/root/backups/`, fecha 2026-09-19 15:39). No se lee; se asume valido como declara Daniel.

### HALLAZGO AUDITADO: la feature YA esta implementada en la base
La evidencia muestra que los 3 puntos del pedido ya estan resueltos en `fb8cbbf`:

1. **Columna en la DB (SQLite staging)** — `./data/rumihome.db` (bindmount `/data/rumihome.db`):
   - `PRAGMA table_info(reservations)` incluye `guest_phone TEXT`.
   - Conteo de reservas = **4**. Una reserva ya tiene telefono cargado (`+56912345678`).

2. **Campo en el formulario del portal huesped**:
   - `app/src/pages/GuestReservation.tsx`: form de check-in ya tiene `Teléfono de contacto` (`#g-phone`, `type="tel"`, required) y lo muestra en el `detail-grid`.
   - `app/src/pages/ReservasTab.tsx` (admin): form de creacion/edicion ya envía `guest_phone` (`#f-phone`).
   - `app/src/types.ts` y `app/src/api/client.ts` ya tipan `guest_phone` (Reservation, NewReservation, GuestReservationView).

3. **Persistencia en endpoints**:
   - `server/src/db/reservations.ts`: `CREATE TABLE` con `guest_phone TEXT`; interface `ReservationRow.guest_phone`; `createReservation`, `updateReservation` y `guestUpdateReservation` lo persisten.
   - `server/src/routes/admin.ts`: `POST /reservations` recibe `guest_phone`; `guestView` lo devuelve; `PATCH /api/guest/reservation` (check-in online) lo guarda.
   - **Verificado EN VIVO en staging**: `POST /rr/api/guest/lookup` (api-rr, 172.16.1.2:3001) con PNR `RUMI-53MSJE` + RUT devuelve `guest_phone: "+56912345678"` → la cadena ya funciona end-to-end.

### Gap real (el sentido de "MIGRACION DB")
El codigo y la DB de staging ya cumplen los 3 puntos. El unico hueco genuino de backend es la
**migracion explicita e idempotente** de la columna: NO existe una funcion `migrateGuestPhone()`
(precedente: `migrateDoorCode()` en `server/src/db/reservations.ts:81`) que garantice que una base
PRE-EXISTENTE creada con esquema anterior (p.ej. copia de prod, seed viejo) quede con la columna.
Sin ella, un INSERT con `guest_phone` sobre una DB antigua falla con `no such column` → eso seria
exactamente el tipo de rotura de datos que Daniel pide prevenir. El trabajo se acota a eso.

## LINEA FRONTERA: que se toca y que NO

### SI
| Responsable | Accion |
|---|---|
| backend | Migracion idempotente `migrateGuestPhone()` en `server/src/db/reservations.ts` (patron `migrateDoorCode`) |
| backend | Backup propio `.rr/db-pre-migracion.db` (WAL checkpoint previo) ANTES de tocar la DB |
| backend | Conteo de reservas ANTES (4) y DESPUES (4) + integridad |
| frontend | SOLO verificar que el form ya tiene el campo (sin cambios de codigo) |
| frontend+backend | Redeploy staging (`docker compose -f docker-compose.rr.yml up -d --build`) |
| qa | Build limpio, diff acotado, pruebas funcionales de la cadena, veredicto GO/NO-GO |

### NO se toca (prohibido)
- NO re-inventar UI ni endpoints de la feature (ya existen y estan verificados en staging).
- `landing/`, `agent/`, `agent-dev/`, `scripts/`, `litestream.yml`, nginx, `docker-compose.rr.yml`,
  middleware/`auth` de Firebase, DB de prod, `/root/backups/*`.
- NO leer `/root/backups/scenario-5-pre.db` (solo verificar presencia por listado).
- NO borrar ramas/tags-historial (`rr-feature-4-rut-validator`, etc.). `rr-feature-5-telefono` queda
  como branch de trabajo hasta "APROBAR" de Daniel.
- NO promote: depende exclusivamente de que Daniel escriba "APROBAR".

## RUTEO
- **pm**: APLICA — redacta este plan con el hallazgo auditado (no codea). Monitoreo rotativo del equipo.
- **supervisor**: APLICA — audita que la migracion sea idempotente, que exista `.rr/db-pre-migracion.db`
  ANTES de cualquier cambio, que el conteo de reservas sea identico antes/despues y que no se toque infra.
- **ux**: NO APLICA — no hay diseno nuevo ni cambio de estilo; el campo ya existe en el form del huesped.
  La revision visual post-deploy la cubre QA como verificacion, no como spec.
- **frontend**: APLICA solo VERIFICACION — el form (`GuestReservation.tsx`) ya tiene el campo y los tipos
  ya lo tipan; sin cambios de codigo. Redeploy de `app-rr`.
- **backend**: APLICA — MIGRACION DB (funcion idempotente + backup + conteo antes/despues). Redeploy de `api-rr`.
- **qa**: APLICA — build limpio, diff acotado, pruebas funcionales de la cadena (lookup/create/check-in),
  conteo e integridad, veredicto GO/NO-GO en `.rr/qa-veredicto.md`.

## TAREAS
1. [pm] Ratificar linea base y hallazgo
   - `git rev-parse HEAD origin/rr` = `fb8cbbf` (verificado). `git status` limpio salvo `.rr/plan.md`.
   - Evidencia recopilada arriba (PRAGMA, grep de codigo, lookup en vivo).
   - Estado: pendiente de cierre (evidencia ya en este plan).

2. [backend] Backup previo `.rr/db-pre-migracion.db` (ANTES de tocar la DB)
   - Confirmar por listado la existencia de `/root/backups/scenario-5-pre.db` (NO abrirlo).
   - Sobre `./data/rumihome.db` (con WAL vigente): `PRAGMA wal_checkpoint(TRUNCATE)` y copiar a
     `.rr/db-pre-migracion.db` (o usar API de backup sqlite para fusionar WAL; nunca solo cp de archivos sueltos).
   - Registrar `COUNT(*)` ANTES = 4.
   - Criterios: archivo creado, tamaño > 0, `PRAGMA integrity_check` = ok, conteo leído = 4.

3. [backend] Migracion DB idempotente `migrateGuestPhone()`
   - En `server/src/db/reservations.ts`, agregar funcion al estilo `migrateDoorCode()` (linea 81):
     `PRAGMA table_info('reservations')`; si NO existe `guest_phone` → `ALTER TABLE reservations ADD COLUMN guest_phone TEXT`.
   - Ejecutarla al arranque tras `migrateLegacySchema()`/`migrateDoorCode()` (lineas 142-143).
   - En staging sera NO-OP (la columna ya existe): la funcion debe ser idempotente y no duplicar columnas ni datos.
   - Criterio: arranque de `api-rr` sin errores; `PRAGMA table_info` sigue con la columna (una sola vez);
     `COUNT(*)` despues = 4 (sin perdida ni duplicacion).

4. [backend] Verificacion "la migracion nunca destruye datos"
   - Comparar `.rr/db-pre-migracion.db` vs DB post-arranque: `COUNT(*)` 4 == 4; `PRAGMA integrity_check` ok;
     mismo set de reservas (pnr/check_in/check_out/guests/guest_phone) fila a fila.
   - Criterios: diff de filas vacio; conteo identico.

5. [frontend] Verificacion del form del huesped (sin cambios de codigo)
   - Confirmar que `GuestReservation.tsx` tiene `#g-phone` (required) y display del telefono; `types.ts`/
     `client.ts` tipan `guest_phone`; `ReservasTab.tsx` (admin) lo envia al crear/editar.
   - Criterio: sin commits frontend; el campo ya esta en la base.

6. [qa] Pruebas funcionales en staging + build + veredicto
   - `lookup` por PNR+RUT devuelve `guest_phone` (ya verificado por pm en vivo).
   - Crear reserva admin con `guest_phone` → 201 y persiste; retomar por guest → el telefono aparece.
     (Si el test crea una reserva, eliminarla al finalizar para que el conteo vuelva a 4.)
   - `PATCH /api/guest/reservation` (check-in online) guarda `guest_phone`.
   - Build limpio: `npm run build` en `app/` y en `server/`.
   - Diff acotado: SOLO `server/src/db/reservations.ts` (migracion) + `.rr/` (plan, veredicto). Nada en infra.
   - Escribir `.rr/qa-veredicto.md` con GO/NO-GO e incluir conteo antes/despues y evidencia.

7. [frontend+backend] Redeploy staging
   - `docker compose -f docker-compose.rr.yml up -d --build` (rebuild `app-rr` y `api-rr`).
   - Criterio: `/rr/app/reserva` operativo y `/rr/api/` operativo post-rebuild.

8. [pm] Cierre
   - Confirmar backup `.rr/db-pre-migracion.db` + conteo intacto, diff acotado, veredicto QA.
   - Registrar desviaciones en SECCION DE ABAJO. NO promote sin "APROBAR" de Daniel.

## HISTORIAL / DESVIACIONES
- Escenario 1-3: lecciones previas registradas (PM codio -> prohibido; plan.md antes de asignar; permisos endurecidos).
- Escenario 4: RUT construido/QA en branch, NUNCA fusionado; rollback ordenado; `rr` = `fb8cbbf` = base escenario 5.
- Escenario 5: hallazgo auditado por PM — la feature (columna, form, endpoints) YA existe en la base y
  esta operativa en staging (verificado en vivo). El trabajo se acota a la migracion DB idempotente explicita
  + backup/count guard + veredicto QA, evitando re-trabajo y espacando el alcance al riesgo real de rotura de datos.