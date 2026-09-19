# Plan: ROLLBACK escenario 1 — reversión completa del modo oscuro

## Orden de Daniel (escenario 1 — rollback)
"Revertir COMPLETAMENTE el modo oscuro del espejo. El código debe volver **idéntico** al
tag `scenario-1-base`. La infra del espejo (estructura `/rr/` + `/rr/app/`, compose) **NO
se toca**."

## Estado actual (análisis previo, hecho por pm)

| Ítem | Valor |
|---|---|
| Rama actual | `rr-feature-1-modo-oscuro` (worktree limpio) |
| HEAD actual | `4102a7a` (docs escenario 1) |
| Tag objetivo | `scenario-1-base` (estado previo al modo oscuro) |
| Commit modo oscuro admin | `6fada5c` + `16818ec` (fix NO-GO) |
| Commit docs escenario | `4102a7a` |

### Qué cambió entre `scenario-1-base` y HEAD (modo oscuro)
Solo **10 archivos**: 3 de coordinación (`.rr/*`) + 7 de producto (`app/*`):

| Archivo | Cambio |
|---|---|
| `app/index.html` | script inline anti-FOUC (lee `rumihome.theme`) |
| `app/src/styles.css` | tokens `:root[data-theme='dark']`, overrides `.admin-theme`, vars `--chart-*` |
| `app/src/pages/DashboardTab.tsx` | colores SVG hardcodeados → `var(--chart-*)` |
| `app/src/pages/AdminDashboard.tsx` | monta `ThemeToggle` en topbar |
| `app/src/pages/AdminLogin.tsx` | monta `ThemeToggle` en login |
| `app/src/components/ThemeToggle.tsx` | **NUEVO** (toggle sol/luna) |
| `app/src/hooks/useTheme.ts` | **NUEVO** (hook + localStorage) |

Resultado del análisis de infra (crítico):
```
git diff scenario-1-base..HEAD -- docker-compose.rr.yml landing/ app/Dockerfile \
  app/vite.config.ts app/package.json docker-compose.yml scripts/ server/ litestream.yml agent/  → 0 líneas
```
**La infra del espejo ya es byte-idéntica entre el tag y HEAD.** O sea: revertir el modo
oscuro (los 7 archivos de `app/*`) NO toca infra por definición. Nginx vive fuera del repo
(`/etc/nginx`) y no se menciona en ningún commit del escenario.

## LÍNEA FRONTERA del rollback

### SÍ se revierte (→ estado `scenario-1-base`)
- Los **7 archivos `app/*`** del modo oscuro (los 5 modificados se restauran, los 2 nuevos
  se eliminan).
- Resultado exigido: `git diff scenario-1-base -- app/ landing/` = **vacío**.

### NO se toca (prohibido en este rollback)
- Infra del espejo: estructura `/rr/` (landing) + `/rr/app/` (SPA), `docker-compose.rr.yml`,
  `app/vite.config.ts`, `app/Dockerfile`, nginx (fuera de repo), credenciales, DB.
- `server/`, `agent/`, `scripts/`, `litestream.yml` (no tienen diff con el tag → intocables).
- Portal huésped y landing (ya son idénticos al tag → ni tocarlos para "verificar").

### Tratamiento de `.rr/*` (docs de coordinación, NO son código ni infra)
- `plan.md` (este archivo): se conserva — documenta el rollback.
- `ux-modo-oscuro.md` y `qa-veredicto.md` del escenario: **quedan como historial** de
  coordinación. Si se exige árbol 100 % idéntico al tag, opcionalmente se restauran/eliminan,
  pero el requisito de Daniel ("el código") aplica a código de producto `app/` + `landing/`.

## RUTEO

| Agente | Aplica | Motivo |
|---|---|---|
| pm | **APLICA** | Clarifica, analiza el diff, decide ruteo y redacta este plan. **NO codea.** |
| supervisor | **APLICA** | Audita que el revert NO toque infra (compose, nginx, estructura `/rr/`, DB) ni `server/`/`agent/`; que el diff final respecto al tag esté limitado a `.rr/`. |
| ux | **APLICA (después del revert)** | Gate visual post-deploy: el panel `/rr/app/admin` vuelve a la estética clara estándar, sin toggle ni rastro de tema oscuro. |
| frontend | **APLICA** | Ejecuta el revert de código en `app/` y deja `npm run build` limpio. |
| backend | **NO APLICA** | No hay cambios de datos ni endpoints: el modo oscuro era 100 % client-side. |
| qa | **APLICA (siempre)** | Verifica byte-identidad de `app/`+`landing/` contra el tag, que la infra no fue tocada, build limpio y escribe veredicto en `.rr/qa-veredicto.md`. |

**Reglas de ruteo aplicadas:** cambio de estilo → ux siempre revisa; solo UI → frontend;
sin datos → backend no aplica; QA siempre.

## TAREAS

1. **[pm] Snapshot previo al rollback** — registrar SHA `4102a7a` y opcionalmente crear tag
   `scenario-1-modo-oscuro` en HEAD para poder re-aplicar el dark mode si se pide. Estado: **hecho (plan)**.

2. **[frontend] Revertir el código de `app/` al tag**
   - Método recomendado (quirúrgico, conserva `.rr/` como historial):
     ```
     git restore --source=scenario-1-base -- app/index.html app/src/styles.css \
       app/src/pages/AdminDashboard.tsx app/src/pages/AdminLogin.tsx app/src/pages/DashboardTab.tsx
     git rm app/src/components/ThemeToggle.tsx app/src/hooks/useTheme.ts
     ```
   - Método total (árbol EXACTO al tag, p.ej. si se prefiere cero ruido): `git reset --hard scenario-1-base`.
     ⚠️ También deja `.rr/*` en el estado del tag; implica re-escribir luego este plan como cambio local.
   - Verificación inmediata:
     ```
     git diff scenario-1-base -- app/ landing/          # → vacío
     git status                                          # solo .rr (docs) y/o nuevos cambios de este plan
     ```
   - Commit sugerido (rama actual `rr-feature-1-modo-oscuro`): `rr(feat): reversion modo oscuro (escenario 1)`.
     Alternativa permitida: rama `rr-feature-1-rollback`.

3. **[frontend] Build** — `cd app && npm run build` debe pasar sin referencias a
   `ThemeToggle`, `useTheme`, `data-theme`, `rumihome.theme`, `--chart-*` (grep de control).

4. **[ux] Revisión visual en staging** — `/rr/app/admin` y `/rr/app/admin/panel`: sin toggle
   sol/luna, tema claro estándar en login + 3 tabs, sin residuos oscuros ni leyendas invisibles.

5. **[qa] Validación final** — diff `app/`+`landing/` vacío vs tag; `git show --stat` del
   commit de rollback limitado a `app/*` (más `.rr/` si aplica); build limpio; veredicto
   GO/NO-GO en `.rr/qa-veredicto.md`. Con GO → deploy a staging (`docker compose -f docker-compose.rr.yml up -d --build`).

6. **[supervisor] Auditoría de infra** — confirmar por escrito que `docker-compose.rr.yml`,
   estructura `/rr/`, `scripts/`, `server/`, `agent/`, `litestream.yml` no aparecen en el
   diff del rollback. Si detecta desvío: `.rr/HALT` + informe a Daniel.

## Criterios de aceptación (rollback escenario 1)
- [ ] `git diff scenario-1-base -- app/ landing/` = **vacío** (código idéntico al tag).
- [ ] Sin rastro de modo oscuro en `app/` (grep `ThemeToggle`, `useTheme`, `data-theme`,
      `rumihome.theme`, `--chart-*` sin resultados).
- [ ] Infra intocada: `docker-compose.rr.yml`, estructura `/rr/` + `/rr/app/`, nginx, DB.
- [ ] `npm run build` limpio en `app/`.
- [ ] Estética clara estándar en `/rr/app/admin` y `/rr/app/admin/panel` (ux).
- [ ] QA GO en `.rr/qa-veredicto.md`.

## HISTORIAL (se conserva como aprendizaje)
- Iteración 1: PM codeó directamente (violación de rol) → PM prohibido de codear.
- Iteración 2: plan escrito ANTES de asignar; PM no codea.
- Iteración 3: reversión total de la estética 90s (landing + SPA); infra `/rr/` intacta.
- Escenario 1: modo oscuro del panel `/admin` implementado, corregido por NO-GO de QA, y
  ahora **revertido por orden de Daniel** al estado `scenario-1-base`. Lección: la infra
  del espejo es byte-idéntica entre tag y HEAD → el rollback de código no la afecta.