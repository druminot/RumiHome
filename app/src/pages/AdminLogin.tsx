import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { firebaseEnabled, getAuthInstance, signInWithEmailAndPassword, getIdToken } from '../firebase'

const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH ?? '/admin'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (!firebaseEnabled || !getAuthInstance()) {
        setError('Firebase no está configurado. Define las variables VITE_FIREBASE_* en .env')
        return
      }
      await signInWithEmailAndPassword(getAuthInstance()!, email, password)
      const token = await getIdToken()
      sessionStorage.setItem('admin_token', token ?? '')
      navigate(`${ADMIN_PATH}/panel`)
    } catch (err) {
      setError('Credenciales inválidas o error de conexión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <Link className="logo" to="/">rumi<span>home</span></Link>
        <p className="subtitle">Acceso administrador — gestión de reservas</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn full" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}