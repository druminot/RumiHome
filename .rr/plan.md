# Plan: Rollback modo oscuro escenario T1

## Orden de Daniel
Revertir el modo oscuro: el branch `rr` debe quedar con código **idéntico al
tag `t1-base`** (`b9d0d2e`). El branch `rr-t1-modo-oscuro` se conserva como
historial (no se borra). Sin push, sin promote.

## Estado base (verificado por PM)
| Referencia | Commit | Nota |
|---|---|---|
| `t1-base` | `b9d0d2e` | destino del rollback (diseño claro previo, sin modo oscuro) |
| `rr` = `origin/rr` | `1436fb5` | "T1 merge historial": merge del modo oscuro (padres: `b9d0d2e` + `b7884a7`) |
| `rr-t1-modo-oscuro` | `b7884a7` | historial del modo oscuro — NO se toca |

- El diff `t1-base..rr` son 18 archivos: `app/` (ThemeToggle, useTheme,
  styles.css, index.html, AdminLogin, AdminDashboard, DashboardTab,
  tsconfig.tsbuildinfo) + `.opencode/agents/*.md` + docs `.rr/`.
- `server/`, `landing/`, `agent/`, `scripts/`, `docker-compose.rr.yml` NO
  están en el diff → intocados por la feature.
- Método elegido: `git revert -m 1 1436fb5` sobre `rr` (merge revert con el
  primer padre). El árbol resultante queda idéntico a `t1-base` y el historial
  del merge se conserva (historia publicada en `origin/rr` no se reescribe;
  `reset --hard` queda descartado por reescribir historia publicada).

## RUTEO
Regla aplicada: rollback de UI ya implementada (sin diseño nuevo) → frontend
ejecuta la reversión; QA siempre. El resultado del revert deshace TODO el
diff, incluidos `.opencode/agents/` y docs `.rr/` (restauración literal del
árbol a `t1-base`, no edición manual).
- ux: NO APLICA — no hay spec nueva ni diseño; se restaura la identidad
  visual previa de `t1-base` tal cual (`git revert` la devuelve sin intervención).
- frontend: APLICA — ejecuta el revert del merge en `rr`; todo el código de
  producto afectado es `app/` (modo oscuro del admin).
- backend: NO APLICA — sin cambios en `server/` ni API.
- qa: APLICA — verifica identidad del árbol con `t1-base` + build + veredicto.

## TAREAS
1. [frontend] Rollback modo oscuro en rr
   - Criterios: en `git checkout rr` (árbol limpio antes); `git revert -m 1
     1436fb5` con mensaje estilo repo (ej. "rr(frontend): rollback modo
     oscuro (escenario T1)"); verificar `git diff t1-base rr` = **vacío**
     (0 archivos); confirmar `git diff t1-base origin/rr` sigue mostrando el
     diff del modo oscuro si NO se hizo push (o vacío si el pipeline pushea
     el revert). NO tocar `server/`, `landing/`, `agent/`, `scripts/`,
     `docker-compose.rr.yml`, `litestream.yml`. NO borrar ni alterar
     `rr-t1-modo-oscuro`. NO push ni promote.
   - Estado: hecha
2. [qa] Verificacion rollback
   - Criterios: `git diff t1-base rr` sin salida; `npm run build` en `app/`
     pasa limpio; no existen `ThemeToggle.tsx` ni `useTheme.ts`; sin
     `data-theme` ni anti-FOUC en `app/index.html`; portal huésped intacto;
     veredicto GO/NO-GO escrito en `.rr/qa-veredicto.md`.
   - Estado: pendiente

## DESVIACIONES
(ninguna)