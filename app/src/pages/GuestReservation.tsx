import { useEffect, useState } from 'react'
import { useParams, useLocation, Link, Navigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Reservation } from '../types'

const GUEST_PATH = import.meta.env.VITE_GUEST_PATH ?? '/reserva'

const STATUS_TEXT: Record<string, string> = {
  pendiente: 'Pendiente de confirmación',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
}

export default function GuestReservationPage() {
  const { pnr } = useParams<{ pnr: string }>()
  const location = useLocation() as {
    state: { reservation: Reservation; name: string; rut: string } | null
  }
  const [reservation, setReservation] = useState<Reservation | null>(
    location.state?.reservation ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!location.state?.reservation)

  useEffect(() => {
    if (!location.state?.reservation || !pnr) return
    const { name, rut } = location.state
    api
      .guestReservation(pnr, name, rut)
      .then(setReservation)
      .catch(() => setError('No se pudo cargar la reserva.'))
      .finally(() => setLoading(false))
  }, [pnr, location.state])

  if (!location.state?.reservation && !loading) {
    return <Navigate to={GUEST_PATH} replace />
  }

  function fmt(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  function nights(a: string, b: string) {
    const diff = new Date(b).getTime() - new Date(a).getTime()
    return Math.round(diff / 86400000)
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

        {reservation && (
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
                <b>Check-in</b>
                <span>{fmt(reservation.check_in)}</span>
              </div>
              <div className="item">
                <b>Check-out</b>
                <span>{fmt(reservation.check_out)}</span>
              </div>
              <div className="item">
                <b>Noches</b>
                <span>{nights(reservation.check_in, reservation.check_out)}</span>
              </div>
              <div className="item">
                <b>Huéspedes</b>
                <span>{reservation.guests}</span>
              </div>
            </div>

            {reservation.notes && (
              <div className="alert info">
                <strong>Notas:</strong> {reservation.notes}
              </div>
            )}

            <a className="back-link" href="/">← Volver al inicio</a>
          </div>
        )}
      </div>
    </div>
  )
}