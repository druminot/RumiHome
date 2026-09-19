# UX Spec — Validación RUT chileno en `/reserva` (portal huésped)

**Feature:** escenario 4 · **Fecha:** 2026-09-19
**Fuente de verdad del diseño:** `app/src/styles.css` (tokens del SPA).
**Línea frontera:** fijada en `.rr/plan.md` — esta spec toca SOLO
`app/src/pages/GuestLogin.tsx` (+ `app/src/lib/rut.ts` como espejo del
algoritmo). No se toca `ReservasTab.tsx`, ni landing, ni agent.

## Problema
El form de lookup (`RUT / DNI`) acepta cualquier texto. Un RUT mal tipeado
produce "No encontramos una reserva…" (mensaje confuso: el huésped no sabe si
falló el PNR, el RUT o el formato). La validación es de integridad de dato (el
huésped se autentica con PNR + RUT), así que el error debe ser **preciso** y
mostrarse **antes** de llamar al servidor.

## Comportamiento (macro)
La validación es **quieto-valida**: no bloquea al escribir, valida en **blur** y
en **submit**.

```
ESCRIBIR ──► sin validación, nunca se bloquea el input
  │
  ├─ blur (campo con contenido) ──► VALIDAR
  │      └─ inválido → error inline + aria-invalid (sin request)
  │
  └─ submit ──► VALIDAR
         ├─ RUT inválido → bloquea request, error inline, foco al campo RUT
         └─ RUT válido → normalizar y continuar flujo actual
```

Regla dura: **NO disparar `api.guestLookup` si `validarRut` no es ok**. El
frontend nunca aprende de un 400 que pudo evitar.

## Estados del input (sin estilos nuevos)
La spec del plan prohíbe CSS nuevo; el feedback visual es el mensaje inline +
atributos ARIA. El input **no cambia de chrome** en ningún estado (sin borde
rojo), para no inventar estilos fuera de la línea frontera:

| Estado | Visual input | Feedback |
|---|---|---|
| escribiendo (`onChange`) | normal | ninguno (no molesta mientras corrige) |
| blur / submit validando | normal (foco normal) | nada hasta el resultado; es síncrono |
| inválido (blur o submit) | normal | `.alert error` inline bajo el campo + `aria-invalid="true"` |
| válido | normal | **sin** indicador de éxito (quieto, sin ruido visual) |

Al volver a escribir en el campo inválido, el mensaje inline se limpia en el
`onChange` (no se re-valida por tecla; solo se despinta el error mientras el
usuario corrige). El `:focus-visible` existente (`outline: 3px solid
var(--accent)`) queda intacto y es la única señal de foco.

## Mensajes (copy)
Copy diferenciado por causa (el espejo `validarRut` devuelve el código de error):

| Código | Mensaje inline bajo el campo |
|---|---|
| `RUT_INVALIDO_FORMATO` | "RUT inválido: revisa el formato (ej. 12.345.678-9)." |
| `RUT_INVALIDO_DV` | "RUT inválido: el dígito verificador no es correcto." |
| campo vacío (submit) | lo cubre `required` del input (validación nativa del navegador) |

Reglas de tono:
- 1 línea, en español, accionable ("revisa/formato" vs "verifica los datos").
- Direcciona a la **causa** (formato) separada de la **verificación** (DV).
- Si algún día el backend responde 400 con el mensaje genérico "RUT inválido:
  verifica el formato y el dígito verificador", el frontend lo muestra **inline
  bajo el campo**; cualquier otro 400 sigue como banner `.alert error` de
  formulario. Hoy el frontend no debería llegar a ese 400 (valida antes).

Diferencia de responsabilidades de banner:
- **Banner** `.alert error` (ya existe): SOLO "No encontramos una reserva con
  esos datos…" (404 / PNR inexistente / RUT que no matchea).
- **Inline** bajo el RUT: SOLO errores de RUT (formato/DV). No se mezclan.

## Constate de sintaxis (ayuda al tipeo)
- Placeholder actual `12.345.678-9` se conserva (ya muestra el formato).
- **Opcional (recomendación, no bloqueante para el escenario):** formateo en
  vivo de puntos + guión al escribir (ej. `123456789` → `12.345.678-9`).
  - Si se implementa, `maxLength={12}` (largo canónico máximo) y el input
    conserva `autoComplete="off"` y el estado `rut` **sin normalizar** hasta el
    submit (el formateo es visual; la lógica corre en `validarRut`).
  - Sin formateo en vivo es igual de válido: la normalización ocurre en el
    submit (puntos/guiones/espacios se aceptan al escribir, se limpian al
    validar). No requiere ninguna UI adicional.
- NO se mete cap por expresión regular en `onChange` (bloquearía al escribir y
  complica pegar valores con formato). Todo lo decide `validarRut`.

## Estructura del campo (sobre `GuestLogin.tsx`)
Estructura target, reutilizando solo clases existentes:

```jsx
<div className="field">
  <label htmlFor="g-rut">RUT / DNI</label>
  <input
    id="g-rut"
    required
    autoComplete="off"
    placeholder="12.345.678-9"
    value={rut}
    aria-invalid={rutError ? true : undefined}
    aria-describedby={rutError ? 'rut-error' : undefined}
    onChange={...}   // limpia rutError
    onBlur={...}     // si hay contenido → validarRut → setRutError
  />
  {rutError && (
    <p id="rut-error" className="alert error" role="alert">{rutError}</p>
  )}
</div>
```

Notas de implementación (para frontend, no se codea acá):
- Estado nuevo `const [rutError, setRutError] = useState<string | null>(null)`;
  el estado `error` (banner) sigue existiendo solo para "no encontramos…".
- `handleSubmit`: primero `validarRut(rut)`; si no ok → `setRutError(mensaje
  según código)` y `document.getElementById('g-rut')?.focus()`; NO llamar a
  `api.guestLookup`. Si ok → enviar el RUT **normalizado canónico**
  (`12345678-4`) al navegar al detalle (mismo flujo actual, `rut.trim()`).
- `onBlur` solo valida si el campo tiene contenido; el submit cubre el vacío vía
  `required` + `validarRut` en el handler.
- El mensaje inline usa `.alert error` existente (estilo contiguo al patrón
  actual); `role="alert"` + id enlazado por `aria-describedby`. Sin **ninguna**
  clase CSS nueva.
- Espejos `app/src/lib/rut.ts` == `server/src/lib/rut.ts` (QA diffea ambos).

## Aclaración de DNI extranjero (alcance)
El label sigue diciendo "RUT / DNI". Con la decisión por defecto (validación
estricta RUT chileno, módulo 11) un pasaporte/DNI extranjero se rechaza con el
mensaje de formato. Ese es el alcance literal del pedido; relajar el formato
para DNI extranjero queda anotado en `plan.md` como cambio futuro (no estético,
no de esta spec).

## Criterios de aceptación (gate doble)
1. Escribir un RUT inválido no bloquea el input; el error aparece recién en
   blur o submit, inline bajo el campo, con `role="alert"` y `aria-invalid`.
2. Copy diferenciado: formato ≠ dígito verificador; ambos en 1 línea, español.
3. Con RUT inválido el submit NO ejecuta request (verificable en la pestaña
   Network del navegador).
4. RUT válido con/sin puntos/guiones resuelve igual (normalización) y mantiene
   el flujo actual de navegación al detalle.
5. Sin CSS nuevo: solo `.field`, `.alert error`, `.hint`/placeholder existentes.
6. Build `app` (npm run build) limpio; espejo de algoritmo idéntico entre app y
   server (lo revisa QA).
7. Revisión visual en staging `rumihome.io/rr/app/reserva`: mensaje legible en
   desktop y móvil, no rompe el banner de "no encontramos".

## Validación UX
**Pendiente de revisión visual post-deploy (gate doble).** Spec contrastada
contra `GuestLogin.tsx`, `styles.css` (tokens `--error #b3402e`, `.alert.error`
`#fdeceb`/`#f2c4bd`) y el plan: sin contradicciones de tokens, establece el
estado del input sin agregar estilos, respeta la regla "no bloquear mientras
escribe" y delimita copy/formato/DV. Lista para frontend.