/**
 * Envío de emails vía Resend (preparado, sin activar).
 *
 * Para activar:
 *   1. Crear cuenta en resend.com y obtener API key
 *   2. Verificar el dominio rumihome.io (DKIM/SPF via DNS de Hostinger)
 *   3. Definir RESEND_API_KEY y EMAIL_FROM en docker-compose.yml (servicio api)
 *      Ej: RESEND_API_KEY: re_xxx, EMAIL_FROM: "Rumihome <reservas@rumihome.io>"
 *   4. Llamar a sendReservationEmail() desde createReservation / guestUpdateReservation
 */
const RESEND_URL = 'https://api.resend.com/emails'

export interface EmailPayload {
  to: string
  subject: string
  html: string
}

const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)

export async function sendEmail(payload: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.log('[email] no configurado, omitiendo envío:', payload.subject)
    return false
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    })
    if (!res.ok) {
      console.error('[email] error Resend:', await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[email] fallo de conexión:', err)
    return false
  }
}

export function reservationCreatedEmail(p: {
  guestName: string
  pnr: string
  checkIn: string
  checkOut: string
  totalPrice: number | null
}): { to: string; subject: string; html: string } {
  const priceLine = p.totalPrice
    ? `<p><strong>Total: ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.totalPrice)}</strong></p>`
    : ''
  return {
    to: '',
    subject: `Tu reserva en Rumihome ${p.pnr} está lista`,
    html: `
      <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 520px; margin: 0 auto; background: #FAF9F6; border-radius: 16px; padding: 32px;">
        <h1 style="color: #363636; font-size: 22px;">Hola ${p.guestName} 👋</h1>
        <p style="color: #4a463f;">Tu reserva está registrada. Consulta los detalles y completa tu check-in online con tu nombre y RUT:</p>
        <div style="background: #E8E4DD; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: 700; letter-spacing: 2px; color: #363636;">${p.pnr}</span>
        </div>
        <p style="color: #4a463f;">Check-in: <strong>${p.checkIn}</strong><br/>Check-out: <strong>${p.checkOut}</strong></p>
        ${priceLine}
        <a href="https://rumihome.io/reserva" style="display: inline-block; background: #A9563F; color: white; padding: 12px 28px; border-radius: 50px; text-decoration: none; font-weight: 600;">Ver mi reserva</a>
        <p style="color: #A8A8A8; font-size: 12px; margin-top: 24px;">Rumihome · Arriendo temporal en Concepción, Chile</p>
      </div>`,
  }
}

export const emailReady = (): boolean =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)