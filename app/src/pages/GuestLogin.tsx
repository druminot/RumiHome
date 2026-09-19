import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { validarRut, type RutErrorCode } from '../lib/rut'

const GUEST_PATH = import.meta.env.VITE_GUEST_PATH ?? '/reserva'

const RUT_ERROR_MESSAGES: Record<RutErrorCode, string> = {
  RUT_INVALIDO_FORMATO: 'RUT inválido: revisa el formato (ej. 12.345.678-9).',
  RUT_INVALIDO_DV: 'RUT inválido: el dígito verificador no es correcto.',
}

export default function GuestLoginPage() {
  const navigate = useNavigate()
  const [pnr, setPnr] = useState('')
  const [rut, setRut] = useState('')
  const [rutError, setRutError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleRutBlur() {
    if (!rut.trim()) return
    const res = validarRut(rut)
    if (!res.ok && res.error) setRutError(RUT_ERROR_MESSAGES[res.error])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!rut.trim()) return
    const res = validarRut(rut)
    if (!res.ok) {
      if (res.error) setRutError(RUT_ERROR_MESSAGES[res.error])
      document.getElementById('g-rut')?.focus()
      return
    }
    const rutNormalizado = res.normalizado
    setLoading(true)
    try {
      const r = await api.guestLookup(pnr.trim().toUpperCase(), rutNormalizado)
      navigate(`${GUEST_PATH}/${r.pnr}`, {
        state: { reservation: r, rut: rutNormalizado },
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
              autoComplete="off"
              placeholder="12.345.678-9"
              value={rut}
              aria-invalid={rutError ? true : undefined}
              aria-describedby={rutError ? 'rut-error' : undefined}
              onChange={(e) => {
                setRut(e.target.value)
                if (rutError) setRutError(null)
              }}
              onBlur={handleRutBlur}
            />
            {rutError && (
              <p id="rut-error" className="alert error" role="alert">{rutError}</p>
            )}
          </div>
          <button className="btn full" type="submit" disabled={loading}>
            {loading ? 'Buscando…' : 'Ver mi reserva'}
          </button>
        </form>
      </div>
    </div>
  )
}