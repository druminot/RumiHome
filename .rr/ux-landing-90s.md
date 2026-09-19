# UX Spec — Estética 90s para la LANDING del espejo (landing/)

**Fecha:** 2026-09-18
**Branch:** rr-feature-estilo-90s
**Rol:** ux (spec ANTES de codificar — gate doble)
**Feature:** plan.md → tarea 1 (`landing/index.html` restyling 90s, 100% cosmético)

## Fuente de verdad
1. `app/src/styles.css` — tokens + patrones retro de la SPA (únicos autorizados; copiar valores literalmente).
2. `app/src/components/RetroScroller.tsx` — patrón marquee (div + track + `@keyframes`, NUNCA tag nativo `<marquee>`).
3. `app/index.html` — fuentes Comic Neue (bloque Google Fonts exacto).

## ALCANCE VISUAL (7 secciones)
nav → marquee → hero → amenidades → divider → galería + lightbox → CTA reserva → footer (+ marquee inferior).

---

## 0. INVARIANTES — NUNCA TOCAR (copiar literal desde la versión actual)
- **Contenido y textos**: títulos, subtítulos, captions, `aria-label`, alt de imágenes, texto de botones. Solo se permite `text-transform`/`letter-spacing` (presentación, no modifica strings).
- **Imágenes**: `/rr/img/*` y sus atributos (`src`, `loading`, `fetchpriority`, `alt`).
- **Anclas**: `href="#amenidades"`, `href="#galeria"`, `href="#reservar"` y `section { scroll-margin-top }` (deben seguir saltando bien).
- **Rutas**: `/rr/app/reserva`, `/rr/img/*`.
- **`mailto:`** del botón "Escríbeme por correo" (solo texto/estilo puede cambiar, la URL NO).
- **Lightbox JS**: TODO el `<script>` (open/close, prev/next, teclado Escape/ArrowLeft/ArrowRight, swipe touchstart/touchend, foco). Se permiten SOLO cambios de CSS de `.lightbox`, `.lb-btn`, `.lb-caption`, `.lb-counter`, `.lb-*`.
- **`prefers-reduced-motion: reduce`** block: conservar ÍNTEGRO tal cual.
- **Sin archivos nuevos** (CSS inline en `landing/index.html`), **sin deps npm**, **sin build**.
- **Responsive**: conservar breakpoints `@media (max-width: 900px)` y `(max-width: 560px)` y sus reglas estructurales (grids, ocultar/en mostrar galería).
- **No tag nativo `<marquee>`** → usar div.track + keyframes (RetroScroller).
- **Scope repo**: solo `landing/` + este `.rr/`. Nada en `app/`, `server/`, `agent/`, `scripts/`, compose, infra.

---

## 1. Tokens globales — PALETA VGA IDÉNTICA A `app/src/styles.css`
Reemplazar el `:root` actual (paleta Airbnb: `--bg --text --text-soft --tile --border --accent --accent-hover --success --wood`) por ESTA (copiar 1:1 de `styles.css` líneas 9–31):

```css
:root {
  --bg: #0a0a3c;
  --bg-2: #2c1e4f;
  --star: #ffffff;
  --navy: #000080;
  --teal: #008080;
  --olive: #808000;
  --purple: #800080;
  --maroon: #800000;
  --red: #ff0000;
  --yellow: #ffff00;
  --lime: #00ff00;
  --cyan: #00ffff;
  --magenta: #ff00ff;
  --silver: #c0c0c0;
  --gray: #808080;
  --white: #ffffff;
  --black: #000000;
  --accent: #ff00ff;
  --accent-dark: #cc00cc;
  --gold: #ffcc00;
}
```
> ⚠️ `--text`, `--text-soft`, `--tile`, `--border` DESAPARECEN. Todo selector que los referencie debe migrarse (ver §7).

---

## 2. Reglas globales (body / typo / accesibilidad)

### 2.1 Body — cielo estrellado + cursor crosshair (styles.css L36–50)
```css
body {
  font-family: 'Comic Sans MS', 'Comic Neue', 'Comic Sans', 'Chalkboard SE', 'ComicSansMS', cursive, sans-serif;
  background-color: var(--bg);
  background-image:
    radial-gradient(circle, var(--star) 1px, transparent 1.5px),
    radial-gradient(circle, #ffd7ff 1px, transparent 1.5px),
    radial-gradient(circle, #c9f2ff 1px, transparent 1.5px);
  background-size: 80px 80px;
  background-position: 0 0, 40px 40px, 20px 60px;
  color: var(--white);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  cursor: crosshair;
}
```

### 2.2 Headings (styles.css L52–58)
```css
h1, h2, h3 {
  color: var(--yellow);
  letter-spacing: 0.03em;
  line-height: 1.15;
  text-shadow: 2px 2px 0 var(--red);
  font-weight: 700;
}
```
Mantener los `font-size`/`clamp()` actuales de cada heading (h1 hero, h2 secciones, h2 book-card) — solo cambian color/sombra.

### 2.3 Links (styles.css L60–61)
```css
a { color: var(--cyan); text-decoration: underline; }
a:hover { color: var(--yellow); background: var(--purple); }
```
Exenciones obligatorias (anclas que EMBUELVEN imágenes y nav — ver §3 y §4): `.hero-grid a, .hero-side a, nav.global ul a` → `text-decoration:none; color:inherit;` y `:hover { background: transparent; color: inherit; }` (la navegación conserva su propio hover retro; las anclas de foto mantienen el hover scale de imagen actual en `.hero-grid a:hover img { transform: scale(1.03) }` / `.hero-side a:hover img`).

### 2.4 Focus (styles.css L63–66)
```css
:is(a, button):focus-visible {
  outline: 3px dotted var(--lime);
  outline-offset: 2px;
}
```
Reemplaza al `outline: 3px solid var(--accent); border-radius: 8px` actual.

### 2.5 ::selection (styles.css L68)
```css
::selection { background: var(--magenta); color: var(--yellow); }
```
### 2.6 Fuentes Comic Neue (app/index.html)
Agregar al `<head>` el bloque Google Fonts EXACTO de `app/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Comic+Neue:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
```
(Recurso externo en runtime como en la SPA; se cae a Comic Sans MS offline sin romper nada.)
Opcional: `meta name="theme-color"` → `#0a0a3c` (cosmético).

---

## 3. Marquee — patrón RetroScroller (`RetroScroller.tsx` L13–18 + styles.css L73–97)
INSERTAR 2 franjas decorativas (una bajo `</nav>`, una sobre `<footer>`). Son el ÚNICO markup nuevo; su texto deriva de contenido existente de la landing (bandera para Daniel en §8).

### Tope (bajo nav, variante default `marquee-yellow`)
```css
.marquee {
  background: var(--black);
  color: var(--lime);
  border-top: 3px solid var(--magenta);
  border-bottom: 3px solid var(--magenta);
  font-size: 1rem; font-weight: 700; letter-spacing: 1px;
  padding: 2px 0; overflow: hidden; white-space: nowrap;
}
.marquee.marquee-yellow {
  color: var(--black);
  background: repeating-linear-gradient(90deg, var(--yellow) 0 40px, var(--gold) 40px 80px);
  border-color: var(--red);
}
.marquee .marquee-track {
  display: inline-block; padding-left: 100%;
  animation-name: marquee-scroll; animation-timing-function: linear; animation-iteration-count: infinite;
}
@keyframes marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-100%); } }
```
HTML (estructura idéntica a RetroScroller: `.marquee.marquee-yellow > .marquee-track > span`):
```html
<div class="marquee marquee-yellow" aria-hidden="true">
  <div class="marquee-track" style="animation-duration: 20s;">
    <span>★ RUMIHOME · DEPARTAMENTO AMOBLADO EN CONCEPCIÓN · ARRIENDO TEMPORAL DESDE 2 DÍAS · HASTA 6 HUÉSPEDES · WIFI · CLAVE DE PUERTA · CONCEPCIÓN, CHILE ★&nbsp;</span>
  </div>
</div>
```
- Texto EN MAYÚSCULAS, separadores `·` y `★` (voz de los marquees de la SPA).
- Duración 20s (idéntica vibra a `SPEED=5`; ajuste fino permitido, no menor a 12s).
- `aria-hidden="true"`: contenido decorativo duplicante.

### Inferior (sobre footer, variante clásica `marquee` — misma clase base):
```html
<div class="marquee retro-bottom" aria-hidden="true">
  <div class="marquee-track" style="animation-duration: 25s;">
    <span>★ GRACIAS POR VISITAR NUESTRA WEB · CONSÚLTANOS TUS FECHAS · ESCRÍBENOS POR CORREO ★&nbsp;</span>
  </div>
</div>
```
```css
.retro-bottom { margin-top: 2rem; }
```
Ambos mueren con `prefers-reduced-motion` (regla existente `* { animation:none !important }`).

---

## 4. NAV `nav.global` → barra de rayas (patrón `.admin-topbar` styles.css L226–240)
- **Fondo**: `background: repeating-linear-gradient(90deg, var(--red) 0 30px, var(--yellow) 30px 60px); border-bottom: 6px solid var(--black);` (blanchiar fondo actual; solo padding/altura se mantienen ~64px).
- **Logo**: patrón topbar — `.logo { color: var(--black); text-shadow: 2px 2px 0 var(--white); text-decoration: none; font-weight: 700; }` y `.logo b { color: var(--red); text-shadow: 2px 2px 0 var(--yellow); }` (hoy `b` es el acento del logo — misma idea).
- **Links `ul`**: `color: var(--black); text-decoration:none; font-weight:700; background: transparent; border-radius: 0;` + `:hover { background: var(--white); }` (patrón `.main-tab:hover`, styles.css L603). Extra: `text-transform: uppercase; letter-spacing: 1px;` (presentación).
- **CTA "Consultar disponibilidad"** (clase `.cta-pill`): convertir en el botón retro (ver §7.1). Quitar `border-radius: 22px` (→ 0). Mantener `white-space: nowrap`.

---

## 5. HERO
- **h1**: ya lo cubre §2.2 (mantiene `clamp(26px,3.6vw,40px)` y el quiebre responsive 24px).
- **`.meta`**: `color: var(--cyan);` + `font-weight: 700;` (patrón `.admin-content .lead` / `.guest-header p`). Sobre azul noche legible.
- **`.meta .dot`**: separadores → `background: var(--yellow);` (3px).
- **`.badge-new` ("Disponible")**: reemplazar verde Airbnb por pegatina retro + BLINK:
```css
.badge-new {
  display: inline-block;
  background: var(--gold); color: var(--black);
  font-size: 12px; font-weight: 700;
  letter-spacing: 1px;
  padding: 3px 10px; border: 3px outset; border-color: var(--orange, #ff8000);
  margin-right: 6px;
}
.badge-new.blink { animation: blink-anim 1s steps(2, start) infinite; }
@keyframes blink-anim { to { visibility: hidden; } }
```
(mismas reglas `.badge.pendiente` + `.blink` de styles.css L92–97, L342). Añadir clase `blink` al span en el HTML.
- **Fotos hero** (`.hero-grid a`, `.hero-side a`): enmarcar como de diablo — `border: 6px ridge var(--silver); box-shadow: 6px 6px 0 var(--purple); border-radius: 0;` conservando `display:block; overflow:hidden` y el hover `scale(1.03)` de la imagen (éxime del global `a:hover` §2.3). Mantener separación `gap: 10px` actual.

---

## 6. AMENIDADES `.amenity-grid` → tarjetas ridge blancas
```css
.amenity {
  display: flex; gap: 14px; align-items: flex-start;
  background: var(--white); color: var(--black);
  border: 4px ridge var(--teal);
  box-shadow: 5px 5px 0 var(--navy);
  padding: 14px 16px;
}
.amenity .ico { font-size: 24px; line-height: 1; }
.amenity b { color: var(--purple); border-bottom: 2px dashed var(--purple); padding-bottom: 2px; } /* patrón stat-card b L387–395 */
.amenity span { color: var(--gray); font-size: 14px; }
```
(ocupan el hover/ancho actual del grid de 3 columnas; alternar borde ridge entre teal/gold/cyan por tarjeta es bienvenido, siempre VGA.)

---

## 7. DIVIDER → línea retro doble
```css
.divider hr { border: none; border-top: 4px double var(--cyan); }
```
(patrón `.subtabs` border-bottom, styles.css L617.)

---

## 8. GALERÍA + LIGHTBOX

### Galería `.gallery figure`
```css
.gallery figure {
  border-radius: 0;
  border: 4px ridge var(--silver);
  box-shadow: 5px 5px 0 var(--navy);
  background: var(--white);
  aspect-ratio: 4/3; position: relative; cursor: zoom-in; overflow: hidden;
}
.gallery figure:hover img { transform: scale(1.04); }  /* conservar */
```
### Figcaption → chip terminal (patrón `.pnr`/`.door-code`, styles.css L490/L737)
```css
.gallery figcaption {
  position: absolute; left: 12px; bottom: 12px;
  background: var(--black); color: var(--lime);
  font-family: 'Courier New', monospace;
  font-size: 12px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase;
  padding: 4px 10px; border: 2px inset var(--gray);
  pointer-events: none;
}
```
El texto del caption (Living, Comedor, …) NO cambia.

### Lightbox — SOLO CSS (markup y JS intocables)
- `.lightbox` fondo `rgba(0,0,0,.88)` → conservar (cambiar a `rgba(10,10,60,.92)` opcional).
- `.lightbox img` → `border-radius: 0; border: 4px ridge var(--silver); box-shadow: 8px 8px 0 var(--navy);` (sustituye el sombreado blando).
- `.lb-btn` → estilo Win95: `background: var(--silver); color: var(--black); border: 4px outset var(--gray); border-radius: 0; font-weight: 700;` + `:hover { background: var(--magenta); color: var(--white); border-style: inset; }`. Mantener tamaños (44px / 38px en móvil) y `translateY(-50%)` de prev/next (NO agregar `transform` extra en hover a prev/next para no romper el centrado; en close/next/prev basta el cambio de fondo+border).
- `.lb-caption` → `background: var(--black); color: var(--lime); font-family:'Courier New',monospace; font-weight:700; text-transform:uppercase; letter-spacing:1px; border: 2px inset var(--gray); border-radius: 0;` (mantener posición/`pointer-events:none`).
- `.lb-counter` → `font-family:'Courier New',monospace; font-weight:700; color: var(--yellow);` (mantener posición).
- Media query 560px actual de `.lb-btn/.lb-prev/.lb-next/.lb-counter/.lb-close` → conservar estructura.

---

## 9. CTA RESERVA `.book-card` → panel estilo `auth-card` / `reservation-card`
```css
.book-card {
  background: var(--white); color: var(--black);
  border: 6px ridge var(--magenta);
  outline: 3px double var(--red);
  box-shadow: 8px 8px 0 var(--navy);
  border-radius: 0;
  padding: 40px;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 24px;
}
.book-card h2 { /* §2.2 heading + clamp actual 22-30px */ }
.book-card p { color: var(--purple); font-weight: 700; margin-top: 6px; }
```
`.book-meta` → patrón `.detail-grid .item` (styles.css L547–560):
```css
.book-meta { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.book-meta > div { background: #fffff0; border: 3px inset var(--gray); padding: 8px 12px; font-size: 14px; }
.book-meta b { color: var(--purple); text-transform: uppercase; letter-spacing: 1px; font-size: 12px; display: block; border-bottom: 2px dashed var(--purple); padding-bottom: 2px; margin-bottom: 2px; }
```
### 9.1 Botones (reemplazo de `.cta-pill` / `.cta-pill.small` → patrón `.btn` / `.btn.ghost`, styles.css L172–202)
```css
.cta-pill {
  display: inline-block;
  background: var(--red); color: var(--white);
  padding: 0.7rem 1.6rem;
  border: 4px outset var(--silver); border-radius: 0;
  text-decoration: none; font-weight: 700; font-size: 14px; font-family: inherit;
  letter-spacing: 1px; text-shadow: 1px 1px 0 var(--black);
  white-space: nowrap;
}
.cta-pill:hover { background: var(--magenta); border-style: inset; transform: translate(1px,1px); }
.cta-pill:active { border-style: inset; transform: translate(2px,2px); }
.cta-pill.small {
  background: var(--white); color: var(--black);
  text-shadow: none; border: 4px outset var(--gray); padding: 8px 14px;
}
.cta-pill.small:hover { background: var(--cyan); color: var(--black); }
```
- "Escríbeme por correo" → `.cta-pill` (rojo). El `href="mailto:…"` NO se toca.
- "Ya tengo reserva · Ver mi viaje" → `.cta-pill.small` (ghost blanco).

---

## 10. FOOTER + marquee inferior
```css
footer {
  background: var(--black);
  border-top: 6px solid var(--magenta);
  font-size: 14px; color: var(--silver);
}
.foot-inner a { color: var(--cyan); text-decoration: underline; font-weight: 700; }
.foot-inner a:hover { background: var(--purple); color: var(--yellow); } /* global a:hover, darle ruido */
.foot-inner b { color: var(--yellow); text-shadow: 2px 2px 0 var(--red); }
.foot-legal { font-size: 13px; color: var(--gray); }
```
Agregar el marquee inferior (clase `.marquee retro-bottom`, §3) ANTES del cierre de `<footer>` como bloque hermano (o tras `</main>`; frontend elige, siempre decorativo y `aria-hidden`).

---

## 11. RESPONSIVE — solo migración de neutros
Conservar media queries actuales (900px/560px) y su estructura. Sustituir referencias a tokens eliminados:
- `background: var(--tile)` → `var(--silver)` o `var(--white)` según contexto (§6/§9 ya resuelven cards).
- `.book-card { padding: 28px 22px }` en 560px → conservar.
- `.hero-head h1 { font-size: 24px }` → conservar (color ya viene de §2.2).

---

## 12. INLINE STYLES a migrar (obligatorio — tokens eliminados)
| Línea actual | Acción |
|---|---|
| `<a class="cta-pill" href="mailto:…" style="text-align:center;">` | Conservar `style="text-align:center"` (inofensivo). |
| `<a class="cta-pill small" … style="background:var(--text);text-align:center;">` | ELIMINAR `background:var(--text)` (var no existirá); conservar `text-align:center`. El ghost de §9.1 da el fondo blanco. |
| `<span style="color:var(--text-soft);">Concepción, Chile</span>` (footer) | ELIMINAR el inline; cubierto por `.foot-legal` gris (o clase `.muted`). |

---

## 13. CRITERIOS DE ACEPTACIÓN (para frontend) y gate QA
1. `git diff` ≠ nada fuera de `landing/` y `.rr/`.
2. Paleta VGA idéntica a `app/src/styles.css` (mismos hex); body `#0a0a3c` + estrellas; cursor crosshair; Comic Sans/Neue; headings amarillos con sombra roja; focus dotted lime; ::selection magenta; marquee por patrón RetroScroller (sin tag nativo); blink en "Disponible".
3. Sin deps nuevas; sin archivos nuevos; un solo archivo tocado: `landing/index.html`.
4. Funcionalidad intacta: lightbox (JS sin tocar), anclas saltan (scroll-margin-top), `mailto` íntegro, rutas `/rr/*` idénticas, `prefers-reduced-motion` bloque original intacto.
5. HTML válido (button dentro de label NO — revisar nesting al insertar marquees; el marquee va fuera de `<nav>`/`<footer>`), texto de botones/headings contenido sin alterar.
6. Revisión visual del UX en staging `/rr/` (gate doble) por ux antes de QA/GO.

---

## 14. PERMISOS DE PROMOCIÓN A PROD
RestylING 100% cosmético en la landing pública (SEO/content intactos). Se promueve SOLO con "APROBAR" de Daniel tras ver staging.

## 15. BANDERAS PARA DANIEL (decisiones visibles)
- **Dos marquees nuevos** (texto derivado del contenido existente + voz "★ … ★" de la SPA): único markup agregado; decorativo y `aria-hidden`.
- **Fuente Comic Neue por CDN** (Google Fonts) como en la SPA; fallback Comic Sans MS offline.
- **"Disponible" ahora parpadea** (`.blink`), fiel al criterio blink del plan.
- Forma de los bordes/redondeces cambia (píldoras → rectos). Sin imágenes ni textos modificados.