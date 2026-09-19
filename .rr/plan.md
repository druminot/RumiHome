# Plan: Escenario 3 — Sección de testimonios de huéspedes en la landing

## Orden de Daniel (escenario 3)
Agregar una sección de **testimonios de huéspedes** a la landing del espejo
(`landing/index.html`): **3 testimonios ficticios** con nombre, comuna y texto
breve, ubicados **antes del footer**. Estilo coherente con la landing actual.
**Solo landing** — nada de `app/` ni `server/`.

## Estado base (verificado por PM)
| Referencia | Commit | Nota |
|---|---|---|
| `origin/rr` | `f2eee78` | base del espejo sin la sección |
| `rr-feature-3-testimonios` | `f2eee78` | branch del escenario 3, idéntico a `origin/rr` |

- La landing es **estática** (HTML + CSS inline); su "fuente de verdad" de diseño
  son los tokens CSS del propio `landing/index.html` (`--accent: #FF385C`,
  `--tile: #F7F7F7`, `--border: #DDDDDD`, secciones `max-width:1440px`,
  grillas `repeat(3,1fr)`, títulos `h2` de 22px). No hay `landing/styles.css`.
- Escenario 2 (rollback `expense-ranking`) queda **CERRADO**: el código en `rr` ya
  era idéntico a `scenario-2-base`; se mantuvo el historial en
  `rr-feature-2-ranking-gastos`.

## LÍNEA FRONTERA: qué se toca y qué NO

### SÍ se toca
| Archivo | Cambio |
|---|---|
| `landing/index.html` | nueva sección `#testimonios` (CSS + markup) antes del footer |
| `.rr/plan.md` | este plan (doc) |
| `.rr/ux-testimonios.md` | spec UX pre-código (doc) |
| `.rr/qa-veredicto.md` | adenda con el veredicto QA (doc) |

### NO se toca (prohibido)
- `app/`, `server/`, `agent/`, `scripts/`, `docker-compose.rr.yml`, nginx,
  `litestream.yml`, credenciales.
- Navegación principal (`nav.global`) u otras secciones existentes de la landing:
  el cambio es aditivo (solo se agrega la sección).
- Rutas `/rr/*` existentes: se conservan intactas.

## RUTEO
Reglas aplicadas: solo UI estática (landing) → ux + frontend; QA siempre.

- pm: APLICA — redacta este plan y audita el cumplimiento del alcance.
- supervisor: APLICA — audita que se toque SOLO `landing/` y docs `.rr/`.
- ux: APLICA — spec de la sección (`.rr/ux-testimonios.md`) ANTES de codificar,
  desde los tokens de la landing; revisión visual en staging DESPUÉS del deploy.
- frontend: APLICA — implementa `landing/index.html`.
- qa: APLICA — diff acotado, invariantes de la landing (lightbox, anclas, rutas
  `/rr/*`, mailto) y veredicto GO/NO-GO.
- backend: NO APLICA — sin cambios en `server/`.

## TAREAS
1. [ux] Spec de la sección testimonios (tokens, estructura, responsivo).
   - Criterios: 3 tarjetas; cada una con nombre, comuna y texto breve; estrellas;
   - grilla responsive 3 → 1 columna; estados: `#testimonios` única sección nueva.
   - Estado: hecho (`.rr/ux-testimonios.md`)
2. [frontend] Implementar `#testimonios` en `landing/index.html`
   - Sección nueva ANTES del footer (después de `#reservar`), estética coherente.
   - Sin cambios en nav, hero, amenities, galería, lightbox script, book-card,
     footer, mailto ni rutas `/rr/*`.
   - Estado: hecho (diff 100% aditivo)
3. [qa] Validación
   - `git diff origin/rr --name-only` → solo `landing/index.html` + docs `.rr/`.
   - Repasar invariantes de la landing (grep: `/rr/img/`, `/rr/app/reserva`,
     `mailto`, lightbox, anclas).
   - Veredicto GO/NO-GO en `.rr/qa-veredicto.md`.
   - Estado: hecho (GO, adenda escenario 3)
4. [supervisor] Auditoría de alcance
   - Criterios: fuerte — nada fuera de `landing/` y `.rr/`.
   - Estado: pendiente (auditar diffs; crearía `.rr/HALT` solo si hay desvío)
5. [pm] Cierre: registrar resultado y desviaciones (si hubiera) en historial.
   - Estado: hecho — sin desviaciones nuevas; historial acumulado conservado.

## DESVIACIONES (historial acumulado)
- Iteración 1: PM codeó directamente (violación de rol) → corregido: prohibición explícita en su prompt.
- Iteración 1: plan.md no existía al iniciar frontend → corregido: regla "plan antes de asignar".
- Iteración 1: permisos endurecidos (external_directory deny, /root y /etc/nginx bloqueados).
- Iteración 2: compromiso de NO codear (plan escrito ANTES de asignar a ux/frontend/qa).
- Iteración 3: Daniel revierte la estética 90s completa (landing + SPA). La infra `/rr/` es orden explícita de NO revertir.
- Rollback escenario 2: el endpoint expense-ranking quedó fuera de `rr` por NO haberse mergeado;
  el código en `rr` ya era idéntico a `scenario-2-base`. Se mantiene como historial en
  `rr-feature-2-ranking-gastos`.