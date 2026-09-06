import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../api/client'
import type { Reservation, ReservationStatus, Property, CalendarDay, NewReservation, StayUsageDetail } from '../types'

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
}

function fmtCLP(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', opts)
}

interface FormState {
  property_id: string
  guest_name: string
  guest_rut: string
  guest_email: string
  guest_phone: string
  arrival_time: string
  check_in: string
  check_out: string
  guests: string
  price_per_night: string
  door_code: string
  notes: string
}

const EMPTY_FORM: FormState = {
  property_id: '',
  guest_name: '',
  guest_rut: '',
  guest_email: '',
  guest_phone: '',
  arrival_time: '',
  check_in: '',
  check_out: '',
  guests: '1',
  price_per_night: '',
  door_code: '',
  notes: '',
}

export default function ReservasTab() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | ReservationStatus>('todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formStatus, setFormStatus] = useState<ReservationStatus>('pendiente')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdPnr, setCreatedPnr] = useState<string | null>(null)
  const [stayUsage, setStayUsage] = useState<StayUsageDetail | null>(null)
  const [stayLoading, setStayLoading] = useState(false)

  // Calendario
  const [calProperty, setCalProperty] = useState<number | null>(null)
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [calDays, setCalDays] = useState<CalendarDay[]>([])
  const [calLoading, setCalLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [r, p] = await Promise.all([api.listReservations(), api.listProperties()])
      setReservations(r)
      setProperties(p)
      if (p.length && calProperty == null) setCalProperty(p[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadCalendar = useCallback(async (propertyId: number, year: number, month: number) => {
    setCalLoading(true)
    try {
      const { days } = await api.getCalendar(propertyId, year, month)
      setCalDays(days)
    } catch {
      setCalDays([])
    } finally {
      setCalLoading(false)
    }
  }, [])

  useEffect(() => {
    if (calProperty != null) loadCalendar(calProperty, calMonth.year, calMonth.month)
  }, [calProperty, calMonth, loadCalendar])

  function shiftMonth(delta: number) {
    setCalMonth((m) => {
      const d = new Date(Date.UTC(m.year, m.month - 1 + delta, 1))
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
    })
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, property_id: properties[0] ? String(properties[0].id) : '', price_per_night: properties[0]?.base_price_per_night ? String(properties[0].base_price_per_night) : '' })
    setFormStatus('pendiente')
    setFormError(null)
    setCreatedPnr(null)
    setShowModal(true)
  }

  function openEdit(r: Reservation) {
    setEditing(r)
    setForm({
      property_id: String(r.property_id),
      guest_name: r.guest_name,
      guest_rut: r.guest_rut,
      guest_email: r.guest_email ?? '',
      guest_phone: r.guest_phone ?? '',
      arrival_time: r.arrival_time ?? '',
      check_in: r.check_in,
      check_out: r.check_out,
      guests: String(r.guests),
      price_per_night: r.price_per_night != null ? String(r.price_per_night) : '',
      door_code: r.door_code ?? '',
      notes: r.notes ?? '',
    })
    setFormStatus(r.status)
    setFormError(null)
    setCreatedPnr(null)
    setShowModal(true)
  }

  const formNights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0
    const n = Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86400000)
    return n > 0 ? n : 0
  }, [form.check_in, form.check_out])

  const formTotal = useMemo(() => {
    const price = Number(form.price_per_night)
    if (!Number.isFinite(price) || price <= 0 || formNights <= 0) return null
    return price * formNights
  }, [form.price_per_night, formNights])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (form.check_out <= form.check_in) {
      setFormError('El check-out debe ser posterior al check-in.')
      return
    }
    setSaving(true)
    try {
      const payload: NewReservation & { status?: string } = {
        property_id: Number(form.property_id),
        guest_name: form.guest_name.trim(),
        guest_rut: form.guest_rut.trim(),
        guest_email: form.guest_email.trim() || undefined,
        guest_phone: form.guest_phone.trim() || undefined,
        arrival_time: form.arrival_time.trim() || undefined,
        check_in: form.check_in,
        check_out: form.check_out,
        guests: Number(form.guests),
        price_per_night: form.price_per_night ? Number(form.price_per_night) : null,
        door_code: form.door_code.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }
      if (editing) {
        await api.updateReservation(editing.id, { ...payload, status: formStatus })
      } else {
        const created = await api.createReservation(payload)
        setCreatedPnr(created.pnr)
      }
      if (editing) setShowModal(false)
      await load()
      if (calProperty) loadCalendar(calProperty, calMonth.year, calMonth.month)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function openStayUsage(r: Reservation) {
    setStayLoading(true)
    setStayUsage(null)
    try {
      const d = await api.getStayUsage(r.id)
      setStayUsage(d)
    } catch {
      setStayUsage(null)
    } finally {
      setStayLoading(false)
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
    if (statusFilter !== 'todos' && r.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return r.pnr.toLowerCase().includes(q) || r.guest_name.toLowerCase().includes(q) || r.guest_rut.toLowerCase().includes(q)
  })

  // Días del calendario alineados a lunes
  const firstDow = new Date(Date.UTC(calMonth.year, calMonth.month - 1, 1)).getUTCDay()
  const blanks = (firstDow + 6) % 7

  return (
    <div>
        <h2>Reservas</h2>
        <p className="lead">Gestiona arriendos desde 2 días en adelante.</p>

        {error && <div className="alert error" role="alert">{error}</div>}

        {/* Calendario */}
        <section className="calendar-section">
          <div className="calendar-head">
            <h3>Calendario</h3>
            <select value={calProperty ?? ''} onChange={(e) => setCalProperty(Number(e.target.value))} aria-label="Propiedad">
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="calendar-nav">
              <button className="btn small ghost" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">←</button>
              <span className="month-label">{monthLabelES(monthLabelKey(calMonth.year, calMonth.month))} {calMonth.year}</span>
              <button className="btn small ghost" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">→</button>
            </div>
          </div>
          {calLoading ? (
            <div className="alert info">Cargando calendario…</div>
          ) : (
            <div className="calendar-grid">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
              {Array.from({ length: blanks }).map((_, i) => <div key={'b' + i} className="cal-day blank" />)}
              {calDays.map((d) => (
                <div key={d.date} className={`cal-day ${d.status}`} title={d.guest_name ? `${d.guest_name} (${d.pnr})` : ''}>
                  <span className="cal-num">{Number(d.date.slice(-2))}</span>
                  {d.status !== 'libre' && <span className="cal-pnr">{d.pnr?.replace('RUMI-', '')}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="calendar-legend">
            <span className="legend libre">Libre</span>
            <span className="legend parcial">Entrada/Salida</span>
            <span className="legend ocupado">Ocupado</span>
          </div>
        </section>

        {/* Tabla */}
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Buscar por PNR, nombre o RUT…"
            aria-label="Buscar reservas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Filtrar por estado">
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="confirmada">Confirmadas</option>
            <option value="finalizada">Finalizadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
          <button className="btn" onClick={openCreate}>+ Nueva reserva</button>
        </div>

        {loading ? (
          <div className="alert info">Cargando reservas…</div>
        ) : filtered.length === 0 ? (
          <div className="alert info">
            {reservations.length === 0 ? 'Aún no hay reservas. Crea la primera con "+ Nueva reserva".' : 'Sin resultados para la búsqueda.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PNR</th>
                  <th>Pasajero</th>
                  <th>RUT</th>
                  <th>Propiedad</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Pax</th>
                  <th>Total</th>
                  <th>Clave</th>
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
                    <td>{properties.find((p) => p.id === r.property_id)?.name ?? '—'}</td>
                    <td>{fmtDate(r.check_in)}</td>
                    <td>{fmtDate(r.check_out)}</td>
                    <td>{r.guests}</td>
                    <td>{fmtCLP(r.total_price)}</td>
                    <td>{r.door_code ? <code className="door-code">{r.door_code}</code> : '—'}</td>
                    <td><span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="actions">
                      <button className="btn small ghost" title="Consumo de la estadía" onClick={() => openStayUsage(r)}>⚡</button>
                      <button className="btn small ghost" onClick={() => openEdit(r)}>Editar</button>
                      <button className="btn small danger" onClick={() => handleDelete(r)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? `Editar reserva ${editing.pnr}` : 'Nueva reserva'}</h3>
            {formError && <div className="alert error">{formError}</div>}
            {createdPnr ? (
              <div className="pnr-success">
                <p>Reserva creada ✅</p>
                <div className="pnr-box">{createdPnr}</div>
                <p className="hint">Entrega este código al pasajero. Lo usará junto a su nombre y RUT en rumihome.io/reserva</p>
                <div className="actions-row">
                  <button className="btn full" onClick={() => setShowModal(false)}>Listo</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="field">
                  <label htmlFor="f-prop">Propiedad</label>
                  <select id="f-prop" required value={form.property_id}
                    onChange={(e) => {
                      const p = properties.find((x) => x.id === Number(e.target.value))
                      setForm({ ...form, property_id: e.target.value, price_per_night: p?.base_price_per_night ? String(p.base_price_per_night) : form.price_per_night })
                    }}>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
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
                <div className="field-row">
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
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="f-guests">Huéspedes</label>
                    <input id="f-guests" type="number" min="1" max={properties.find((p) => p.id === Number(form.property_id))?.max_guests ?? 8} required value={form.guests}
                      onChange={(e) => setForm({ ...form, guests: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-price">Precio por noche (CLP)</label>
                    <input id="f-price" type="number" min="0" step="1000" value={form.price_per_night}
                      onChange={(e) => setForm({ ...form, price_per_night: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="f-doorcode">Clave de puerta (4-6 dígitos)</label>
                  <input id="f-doorcode" inputMode="numeric" pattern="[0-9]{4,6}" value={form.door_code}
                    placeholder="Se genera automáticamente si lo dejas vacío"
                    onChange={(e) => setForm({ ...form, door_code: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                  <p className="hint">El pasajero la verá cuando la reserva esté confirmada.</p>
                </div>
                {formTotal != null && (
                  <div className="alert ok">Total estimado: <strong>{fmtCLP(formTotal)}</strong> ({formNights} noches)</div>
                )}
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
            )}
          </div>
        </div>
      )}

      {/* Modal: consumo de la estadía */}
      {(stayUsage || stayLoading) && (
        <div className="modal-backdrop" onClick={() => { setStayUsage(null); setStayLoading(false) }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {stayLoading || !stayUsage ? (
              <div className="alert info">Cargando consumo…</div>
            ) : (
              <>
                <h3>⚡ Consumo de la estadía</h3>
                <p className="hint">
                  {stayUsage.reservation.guest_name} · {stayUsage.reservation.pnr}<br />
                  {stayUsage.reservation.check_in} → {stayUsage.reservation.check_out} · {stayUsage.reservation.property_name}
                </p>
                <div className="stats-grid">
                  <div className="stat-card">
                    <b>Energía total</b>
                    <span>{stayUsage.kwh.toFixed(1)} kWh</span>
                  </div>
                  <div className="stat-card">
                    <b>Costo estimado</b>
                    <span>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(stayUsage.cost_clp)}</span>
                  </div>
                </div>

                {stayUsage.hourly_profile.length > 0 && (
                  <div className="dashboard-section-inner">
                    <h4>Perfil horario (kWh)</h4>
                    <div className="hourly-profile">
                      {Array.from({ length: 24 }, (_, h) => {
                        const point = stayUsage.hourly_profile.find((p) => p.hour === h)
                        const kwh = point?.kwh ?? 0
                        const max = Math.max(...stayUsage.hourly_profile.map((p) => p.kwh), 0.1)
                        const hgt = Math.round((kwh / max) * 100)
                        return (
                          <div key={h} className="hour-bar" title={`${String(h).padStart(2, '0')}:00 — ${kwh.toFixed(2)} kWh`}>
                            <div className="hour-bar-fill" style={{ height: `${hgt}%` }} />
                            <span className="hour-label">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <h4>Dispositivos durante la estadía</h4>
                {stayUsage.device_usage.length === 0 ? (
                  <p className="hint">Sin dispositivos registrados para esta propiedad.</p>
                ) : (
                  <table className="mini-table">
                    <thead><tr><th>Dispositivo</th><th>Tipo</th><th>Horas on</th><th>kWh</th></tr></thead>
                    <tbody>
                      {stayUsage.device_usage.map((d) => (
                        <tr key={d.name}>
                          <td>{d.name}</td>
                          <td>{d.type}</td>
                          <td>{d.minutes_on > 0 ? (d.minutes_on / 60).toFixed(1) : '—'}</td>
                          <td>{d.kwh > 0 ? d.kwh.toFixed(2) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {stayUsage.key_events.length > 0 && (
                  <>
                    <h4>Llave ({stayUsage.key_events.length} eventos)</h4>
                    <ul className="event-list">
                      {stayUsage.key_events.slice(0, 10).map((e, i) => (
                        <li key={i}>
                          <span className={`key-dot ${e.event_type.includes('open') ? 'open' : ''}`} />
                          <span>{e.event_type} {e.detail ? `· ${e.detail}` : ''}</span>
                          <small>{e.event_at.slice(0, 16).replace('T', ' ')}</small>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="actions-row">
                  <button className="btn ghost" onClick={() => setStayUsage(null)}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function monthLabelKey(y: number, m: number): string {
  return `${y}-${m}`
}

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function monthLabelES(key: string): string {
  const m = Number(key.split('-')[1])
  return MONTHS_ES[m - 1] ?? ''
}