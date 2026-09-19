import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'

const GUEST_PATH = import.meta.env.VITE_GUEST_PATH ?? '/reserva'

export default function GuestLoginPage() {
  const navigate = useNavigate()
  const [pnr, setPnr] = useState('')
  const [rut, setRut] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await api.guestLookup(pnr.trim().toUpperCase(), rut.trim())
      navigate(`${GUEST_PATH}/${r.pnr}`, {
        state: { reservation: r, rut: rut.trim() },
      })
    } catch (err) {
      setError('No encontramos una reserva con esos datos. Verifica el PNR y el RUT.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <Link className="logo" to="/">rumi<span>home</span></Link>
        <p className="subtitle">Consulta tu reserva</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="pnr">Código de reserva (PNR)</label>
            <input
              id="pnr"
              required
              autoComplete="off"
              placeholder="RUMI-XXXXXX"
              value={pnr}
              onChange={(e) => setPnr(e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label htmlFor="g-rut">RUT / DNI</label>
            <input
              id="g-rut"
              required
              placeholder="12.345.678-9"
              value={rut}
              onChange={(e) => setRut(e.target.value)}
            />
          </div>
          <button className="btn full" type="submit" disabled={loading}>
            {loading ? 'Buscando…' : 'Ver mi reserva'}
          </button>
        </form>
      </div>
    </div>
  )
}