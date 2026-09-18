const SPEED = 5
const DEFAULT_TEXT = '★ ✦ ★ BIENVENIDO A RUMIHOME · DEPARTAMENTO EN CONCEPCIÓN PARA ARRIENDO TEMPORAL · RESERVAS, FINANZAS Y DOMÓTICA EN UN SOLO LUGAR · HECHO CON ❤ Y CODE · VISITA WWW.RUMIHOME.IO ★ ✦ ★'

export default function RetroScroller({
  text = DEFAULT_TEXT,
  color = 'marquee-yellow',
  className = '',
}: {
  text?: string
  color?: 'marquee-yellow' | 'marquee'
  className?: string
}) {
  return (
    <div className={`marquee ${color} ${className}`}>
      <div className="marquee-track" style={{ animationDuration: `${SPEED}s` }}>
        <span>{text} &nbsp;</span>
      </div>
    </div>
  )
}