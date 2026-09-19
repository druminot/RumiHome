import { useEffect, useState } from 'react'
import { useParams, useLocation, Link, Navigate } from 'react-router-dom'
import { api } from '../api/client'
import type { GuestReservationView } from '../types'

const GUEST_PATH = import.meta.env.VITE_GUEST_PATH ?? '/reserva'

function fmt(d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', opts)
}

const STATUS_TEXT: Record<string, string> = {
  pendiente: 'Pendiente de confirmación',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
}

function fmtCLP(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

interface GuestState {
  pnr: string
  rut: string
}

export default function GuestReservationPage() {
  const { pnr: pnrParam } = useParams<{ pnr: string }>()
  const location = useLocation() as {
    state: { reservation: GuestReservationView; rut: string } | null
  }
  const [reservation, setReservation] = useState<GuestReservationView | null>(
    location.state?.reservation ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!location.state?.reservation)

  const creds: GuestState | null = location.state
    ? { pnr: pnrParam ?? location.state.reservation.pnr, rut: location.state.rut }
    : null

  useEffect(() => {
    if (!creds || !creds.pnr) return
    api
      .guestReservation(creds.pnr, creds.rut)
      .then(setReservation)
      .catch(() => setError('No se pudo cargar la reserva.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pnrParam])

  if (!location.state?.reservation && !loading) {
    return <Navigate to={GUEST_PATH} replace />
  }

  return (
    <div className="guest-shell">
      <div className="inner">
        <header className="guest-header">
          <a className="logo" href="/">rumi<span>home</span></a>
          <p>Detalle de tu reserva</p>
        </header>

        {loading && <div className="alert info">Cargando…</div>}
        {error && (
          <div className="alert error" role="alert">
            {error} <Link to={GUEST_PATH}>Volver a intentar</Link>
          </div>
        )}

        {reservation && creds && (
          <ReservationCard reservation={reservation} creds={creds} onUpdate={setReservation} />
        )}
      </div>
    </div>
  )
}

function ReservationCard({
  reservation,
  creds,
  onUpdate,
}: {
  reservation: GuestReservationView
  creds: GuestState
  onUpdate: (r: GuestReservationView) => void
}) {
  const [editOpen, setEditOpen] = useState(
    !reservation.guest_email || !reservation.guest_phone, // sugerir check-in si faltan datos
  )
  const [email, setEmail] = useState(reservation.guest_email ?? '')
  const [phone, setPhone] = useState(reservation.guest_phone ?? '')
  const [arrival, setArrival] = useState(reservation.arrival_time ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    try {
      const updated = await api.guestCheckIn(creds.pnr, creds.rut, {
        guest_email: email.trim() || undefined,
        guest_phone: phone.trim() || undefined,
        arrival_time: arrival.trim() || undefined,
      })
      onUpdate(updated)
      setSaved(true)
      setEditOpen(false)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="reservation-card">
      <span className="pnr">{reservation.pnr}</span>
      <h2>Hola, {reservation.guest_name.split(' ')[0]} 👋</h2>
      <p className="status-line">
        Estado:{' '}
        <span className={`badge ${reservation.status}`}>
          {STATUS_TEXT[reservation.status] ?? reservation.status}
        </span>
      </p>

      <div className="detail-grid">
        <div className="item">
          <b>Propiedad</b>
          <span>{reservation.property_name}</span>
        </div>
        <div className="item">
          <b>Check-in</b>
          <span>{fmt(reservation.check_in)}</span>
        </div>
        <div className="item">
          <b>Check-out</b>
          <span>{fmt(reservation.check_out)}</span>
        </div>
        <div className="item">
          <b>Noches</b>
          <span>{reservation.nights}</span>
        </div>
        <div className="item">
          <b>Huéspedes</b>
          <span>{reservation.guests}</span>
        </div>
      </div>

      {reservation.total_price != null && (
        <div className="price-summary">
          <span>
            {reservation.nights} noches × {fmtCLP(reservation.price_per_night)}
          </span>
          <span className="total">{fmtCLP(reservation.total_price)}</span>
        </div>
      )}

      {/* Acceso al departamento: solo reservas confirmadas */}
      {reservation.status === 'confirmada' && reservation.door_code && (
        <div className="door-access-card">
          <div className="door-access-head">
            <span className="door-icon">🔑</span>
            <div>
              <b>Acceso al departamento</b>
              <p>Teclado de la puerta principal</p>
            </div>
          </div>
          <div className="door-code-display">{reservation.door_code}</div>
          <p className="hint">Guarda esta clave. Funciona desde el día de tu check-in hasta el día de tu salida.</p>
        </div>
      )}

      {reservation.status === 'pendiente' && (
        <div className="alert info">
          Cuando el anfitrión confirme tu reserva, verás aquí la clave de la puerta.
        </div>
      )}

      {reservation.notes && (
        <div className="alert info">
          <strong>Notas:</strong> {reservation.notes}
        </div>
      )}

      {/* Check-in online */}
      <div className="checkin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Datos de llegada</h3>
          {!editOpen && (
            <button className="btn small ghost" onClick={() => setEditOpen(true)}>Editar</button>
          )}
        </div>
        {saved && !editOpen && <div className="alert ok">Datos actualizados ✅</div>}
        {!editOpen ? (
          <div className="detail-grid">
            <div className="item">
              <b>Correo</b>
              <span>{reservation.guest_email || '—'}</span>
            </div>
            <div className="item">
              <b>Teléfono</b>
              <span>{reservation.guest_phone || '—'}</span>
            </div>
            <div className="item">
              <b>Hora estimada de llegada</b>
              <span>{reservation.arrival_time || '—'}</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCheckIn}>
            <div className="field">
              <label htmlFor="g-email">Correo electrónico</label>
              <input id="g-email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="g-phone">Teléfono de contacto</label>
              <input id="g-phone" type="tel" required value={phone}
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="g-arrival">Hora estimada de llegada</label>
              <input id="g-arrival" type="time" value={arrival}
                onChange={(e) => setArrival(e.target.value)} />
              <p className="hint">Opcional — ayuda a coordinar la entrega de llaves</p>
            </div>
            {err && <div className="alert error">{err}</div>}
            <button className="btn full" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar datos de check-in'}
            </button>
          </form>
        )}
      </div>

      <a className="back-link" href="/">← Volver al inicio</a>
    </div>
  )
}