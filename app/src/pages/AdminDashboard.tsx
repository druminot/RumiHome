import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { firebaseEnabled } from '../firebase'
import type { Reservation, ReservationStatus } from '../types'

const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH ?? '/admin'

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
}

interface FormState {
  guest_name: string
  guest_rut: string
  guest_email: string
  guest_phone: string
  check_in: string
  check_out: string
  guests: string
  notes: string
}

const EMPTY_FORM: FormState = {
  guest_name: '',
  guest_rut: '',
  guest_email: '',
  guest_phone: '',
  check_in: '',
  check_out: '',
  guests: '1',
  notes: '',
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formStatus, setFormStatus] = useState<ReservationStatus>('pendiente')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const logout = useCallback(async () => {
    if (firebaseEnabled) {
      const { getAuth, signOut } = await import('firebase/auth')
      await signOut(getAuth())
    }
    sessionStorage.removeItem('admin_token')
    navigate(ADMIN_PATH)
  }, [navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReservations(await api.listReservations())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reservas')
      if (err instanceof Error && err.message.includes('401')) logout()
    } finally {
      setLoading(false)
    }
  }, [logout])

  useEffect(() => {
    if (firebaseEnabled) {
      import('../firebase').then(({ getIdToken }) =>
        getIdToken().then((t) => {
          if (!t) navigate(ADMIN_PATH)
        }),
      )
    }
    load()
  }, [load, navigate])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormStatus('pendiente')
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(r: Reservation) {
    setEditing(r)
    setForm({
      guest_name: r.guest_name,
      guest_rut: r.guest_rut,
      guest_email: r.guest_email ?? '',
      guest_phone: r.guest_phone ?? '',
      check_in: r.check_in,
      check_out: r.check_out,
      guests: String(r.guests),
      notes: r.notes ?? '',
    })
    setFormStatus(r.status)
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (form.check_out <= form.check_in) {
      setFormError('El check-out debe ser posterior al check-in.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        guest_name: form.guest_name.trim(),
        guest_rut: form.guest_rut.trim(),
        guest_email: form.guest_email.trim() || undefined,
        guest_phone: form.guest_phone.trim() || undefined,
        check_in: form.check_in,
        check_out: form.check_out,
        guests: Number(form.guests),
        notes: form.notes.trim() || undefined,
        status: formStatus,
      }
      if (editing) {
        await api.updateReservation(editing.id, payload)
      } else {
        await api.createReservation(payload)
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(r: Reservation) {
    if (!confirm(`¿Eliminar la reserva ${r.pnr} de ${r.guest_name}? Esta acción no se puede deshacer.`)) return
    try {
      await api.deleteReservation(r.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const filtered = reservations.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      r.pnr.toLowerCase().includes(q) ||
      r.guest_name.toLowerCase().includes(q) ||
      r.guest_rut.toLowerCase().includes(q)
    )
  })

  function fmt(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="logo" href="/">rumi<span>home</span> · CRM</a>
        <div>
          <span className="whoami">Administrador</span>
          <button className="btn small ghost" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      <main className="admin-content">
        <h2>Reservas</h2>
        <p className="lead">Gestiona arriendos desde 2 días en adelante.</p>

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Buscar por PNR, nombre o RUT…"
            aria-label="Buscar reservas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn" onClick={openCreate}>+ Nueva reserva</button>
        </div>

        {loading ? (
          <div className="alert info">Cargando reservas…</div>
        ) : filtered.length === 0 ? (
          <div className="alert info">
            {reservations.length === 0
              ? 'Aún no hay reservas. Crea la primera con "+ Nueva reserva".'
              : 'Sin resultados para la búsqueda.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PNR</th>
                  <th>Pasajero</th>
                  <th>RUT</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Pax</th>
                  <th>Estado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.pnr}</code></td>
                    <td>{r.guest_name}</td>
                    <td>{r.guest_rut}</td>
                    <td>{fmt(r.check_in)}</td>
                    <td>{fmt(r.check_out)}</td>
                    <td>{r.guests}</td>
                    <td><span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="actions">
                      <button className="btn small ghost" onClick={() => openEdit(r)}>Editar</button>
                      <button className="btn small danger" onClick={() => handleDelete(r)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? `Editar reserva ${editing.pnr}` : 'Nueva reserva'}</h3>
            {formError && <div className="alert error">{formError}</div>}
            <form onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="f-name">Nombre del pasajero</label>
                <input id="f-name" required value={form.guest_name}
                  onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-rut">RUT / DNI</label>
                <input id="f-rut" required value={form.guest_rut} placeholder="12.345.678-9"
                  onChange={(e) => setForm({ ...form, guest_rut: e.target.value })} />
                <p className="hint">El pasajero lo usará para acceder a su reserva.</p>
              </div>
              <div className="field">
                <label htmlFor="f-email">Correo (opcional)</label>
                <input id="f-email" type="email" value={form.guest_email}
                  onChange={(e) => setForm({ ...form, guest_email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-phone">Teléfono (opcional)</label>
                <input id="f-phone" type="tel" value={form.guest_phone}
                  onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-in">Check-in</label>
                <input id="f-in" type="date" required value={form.check_in}
                  onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-out">Check-out</label>
                <input id="f-out" type="date" required value={form.check_out}
                  onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-guests">Huéspedes</label>
                <input id="f-guests" type="number" min="1" max="8" required value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-status">Estado</label>
                <select id="f-status" value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ReservationStatus)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="finalizada">Finalizada</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-notes">Notas (opcional)</label>
                <textarea id="f-notes" rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              {editing && (
                <div className="alert info">
                  PNR para el pasajero: <strong>{editing.pnr}</strong>
                </div>
              )}
              <div className="actions-row">
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}