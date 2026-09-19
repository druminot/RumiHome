# UX Spec — Sección de testimonios (landing del espejo)

**Feature:** escenario 3 · **Fecha:** 2026-09-19
**Fuente de verdad del diseño:** tokens CSS inline de `landing/index.html`
(no existe `landing/styles.css`).

## Decisión de diseño
Sección de color de fondo blanco (`--bg`) con 3 tarjetas sobre fondo neutral
(`--tile`), borde sutil (`--border`) y radio 16px — mismo lenguaje visual de la
grilla de amenidades y la `book-card`. No se toca nav, hero, amenities, galería,
book-card, footer ni el script del lightbox.

## Tokens reutilizados
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#ffffff` | fondo de la sección |
| `--tile` | `#F7F7F7` | fondo de cada tarjeta y del avatar (patrón `book-card`) |
| `--border` | `#DDDDDD` | borde de tarjetas y avatar |
| `--text` | `#222222` | nombre + texto del testimonio |
| `--text-soft` | `#6a6a6a` | comuna |
| `--accent` | `#FF385C` | estrellas (5) |
| — | `max-width:1440px` / `max(20px, 2.5vw)` | contenedor como el resto de secciones |
| — | `h2` 22px / weight 700 / `letter-spacing:-.01em` | título de sección (patrón "El espacio") |

## Contenido (ficticio)
Tarjetas de ejemplo (3) — nombre realista, comuna de la zona de Concepción,
texto breve (≤ 3 líneas) que refiere amenities reales (check-in autónomo, Wi-Fi,
limpieza, ubicación):

1. **Carolina Salazar** — Concepción
   *"La llegada con clave digital fue súper simple: llegamos a la hora que necesitábamos. Wi-Fi rápido para trabajar y todo impecable."*
2. **Franco Medina** — San Pedro de la Paz
   *"Departamento impecable y muy bien ubicado, cerca de supermercados y restaurantes. El check-in autónomo es un 7."*
3. **Valentina Rojas** — Talcahuano
   *"Todo limpio, cómodo y tal cual las fotos. Se nota el cuidado en los detalles; volveríamos sin dudarlo."*

Cada texto refiere amenities reales (check-in autónomo, Wi-Fi, limpieza, ubicación)
y cabe en ≤ 3 líneas desktop. Es copy ficticio propuesto: si Daniel quiere, se
ajusta sin tocar la estructura.

Estructura de cada tarjeta (top→bottom): estrellas ★★★★★ (accent) → texto
entre comillas → footer con avatar circular (inicial) + nombre (bold) + comuna
(soft).

## Estructura HTML
```
<section id="testimonios" class="testimonials" aria-labelledby="t-test">
  <h2 id="t-test">Lo que dicen nuestros huéspedes</h2>
  <div class="testimonial-grid">      ← 3 columnas desktop
    <article class="testimonial">
      <div class="stars" role="img" aria-label="Calificación: 5 de 5">★★★★★</div>
      <blockquote class="quote">“…”</blockquote>
      <footer class="who">
        <span class="avatar" aria-hidden="true">C</span>
        <div><b>Carolina Salazar</b><span>Concepción</span></div>
      </footer>
    </article>
    … (×3)
  </div>
</section>
```
Insertar DENTRO de `<main>`, tras el cierre `</section>` de `#reservar` y antes de
`</main>` (queda así ANTES de `<footer>`), precedida por un `.divider` (patrón
existente `Amenidades → Galería`). Que viva dentro de `<main>` la mantiene como
contenido principal (semántica correcta); el resultado visual es idéntico a
ponerla entre `</main>` y `<footer>`.

## Estilo de tarjeta (detalle fino)
Valores tomados del ritmo tipográfico/espaciado ya presente en la landing
(`amenities` y `book-card`), para que frontend no tenga que inventar:

- `.testimonials`: `max-width:1440px; margin:0 auto; padding:40px max(20px, 2.5vw) 64px;`
- `.testimonials h2`: 22px / 700 / `letter-spacing:-.01em` / `margin-bottom:20px`.
- `.testimonial-grid`: `display:grid; grid-template-columns:repeat(3,1fr); gap:16px;`
- `.testimonial`: `background:var(--tile); border:1px solid var(--border); border-radius:16px; padding:24px; display:flex; flex-direction:column; gap:12px; text-align:left;`
- `.stars`: `color:var(--accent); font-size:15px; letter-spacing:2px;`
- `.quote`: `font-size:15px; line-height:1.5; color:var(--text);` (comillas tipográficas “ ”)
- `.who`: `display:flex; align-items:center; gap:12px; margin-top:auto;`
- `.avatar`: 40×40px, `border-radius:50%; background:var(--tile); border:1px solid var(--border);` inicial centrada, 600, `color:var(--text)`.
- nombre (`b`): 15px / 600; comuna (`span`): 13px / `color:var(--text-soft)`.

## Responsive
- Desktop: `grid-template-columns: repeat(3, 1fr)` (gap 16px).
- `≤900px`: 1 columna (texto largo se lee mejor a ancho completo).
- `≤560px`: `.testimonial { padding: 20px; }` (mismo ajuste que `.book-card` a `28px 22px`).
- Sin columnas intermedias adicionales (se mantiene simple, coherente con
  `amenity-grid` que colapsa hasta 1fr).

## Criterios de aceptación (gate doble)
1. Sección SOLO en `landing/index.html`, aditiva, sin alterar secciones previas.
2. 3 testimonios con nombre + comuna + texto breve antes del footer.
3. Estética coherente (tokens arriba). Accesible (`aria-labelledby` en la
   sección, `role="img"` + `aria-label` en estrellas, avatar `aria-hidden`); no
   rompe lightbox, anclas, mailto ni rutas `/rr/*`.
4. Revisión visual en staging post-deploy: `rumihome.io/rr/` → 3 tarjetas
   legibles en desktop y móvil.

## Validación UX
**Validada por ux — 2026-09-19.** Revisión crítica hecha contra `landing/index.html`
real. Se corrigieron en la spec: (1) contradicción de tokens (fondo de tarjeta =
`--tile`, no `--bg`; el diseño no usa sombras), (2) faltaba el copy de las 3 citas,
(3) `aria-label` de estrellas sin `role="img"` no era válido, (4) posición
ambigua respecto a `<main>` y (5) faltaban los valores finos de estilo/tipografía.
La spec queda lista para frontend.