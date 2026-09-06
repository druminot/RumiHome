import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { FinanceAnalytics, Property, SmartHomeSummary } from '../types'

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function fmtCLP(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

const CATEGORY_LABEL: Record<string, string> = {
  servicios: 'Servicios',
  mantencion: 'Mantención',
  comision: 'Comisiones',
  insumos: 'Insumos',
  otro: 'Otro',
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  airbnb: 'Airbnb',
  booking: 'Booking',
  otro: 'Otro',
}

const DEVICE_TYPE_LABEL: Record<string, string> = {
  luz: 'Luz',
  llave: 'Llave',
  presencia: 'Presencia',
  calefaccion: 'Calefacción',
  tv: 'TV',
  energia: 'Medidor energía',
}

/** Bar chart SVG simple: ingresos vs gastos por mes. */
function IncomeChart({ series }: { series: FinanceAnalytics['monthly_series'] }) {
  const W = 560, H = 200, PAD = 28, BW = 16
  const max = Math.max(...series.flatMap((s) => [s.income, s.expenses]), 1)
  const step = (W - PAD * 2) / Math.max(series.length, 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingresos vs gastos por mes" className="chart">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={PAD} x2={W - PAD} y1={H - PAD - (H - PAD * 2) * f} y2={H - PAD - (H - PAD * 2) * f}
          stroke="#E8E4DD" strokeWidth="1" />
      ))}
      {series.map((s, i) => {
        const x = PAD + i * step + step / 2
        const hIn = (s.income / max) * (H - PAD * 2)
        const hEx = (s.expenses / max) * (H - PAD * 2)
        return (
          <g key={s.month}>
            <rect x={x - BW - 2} y={H - PAD - hIn} width={BW} height={Math.max(hIn, 1)} rx="3" fill="#8CA18B" />
            <rect x={x + 2} y={H - PAD - hEx} width={BW} height={Math.max(hEx, 1)} rx="3" fill="#C16A54" />
            <text x={x} y={H - 8} textAnchor="middle" fontSize="11" fill="#A8A8A8">
              {MONTHS_ES[Number(s.month.slice(5)) - 1]}
            </text>
          </g>
        )
      })}
      <g>
        <rect x={W - 150} y={6} width="10" height="10" rx="2" fill="#8CA18B" />
        <text x={W - 135} y={15} fontSize="11" fill="#4a463f">Ingresos</text>
        <rect x={W - 75} y={6} width="10" height="10" rx="2" fill="#C16A54" />
        <text x={W - 60} y={15} fontSize="11" fill="#4a463f">Gastos</text>
      </g>
    </svg>
  )
}

/** Barras apiladas con tooltip nativo, eje Y y promedio. */
function EnergyChart({ data }: { data: SmartHomeSummary['energy_daily'] }) {
  if (data.length === 0) return null
  const W = 720, H = 220, PAD = 44, PADL = 34
  const totals = data.map((d) => d.kwh_guest + d.kwh_admin)
  const max = Math.max(...totals, 1)
  const step = (W - PADL - PAD) / Math.max(data.length, 1)
  const bw = Math.min(step * 0.62, 40)
  const chartH = H - PADL - 24
  const avg = totals.reduce((s, t) => s + t, 0) / data.length
  const avgY = PADL + chartH - (avg / max) * chartH
  const niceMax = Math.ceil(max * 1.15)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Energía diaria por huésped y admin" className="chart">
      {/* Eje Y */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PADL + chartH - f * chartH
        return (
          <g key={f}>
            <line x1={PADL} x2={W - PAD} y1={y} y2={y} stroke="#E8E4DD" strokeWidth="1" />
            <text x={PADL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#A8A8A8">
              {(niceMax * f).toFixed(1)}
            </text>
          </g>
        )
      })}
      {/* Línea de promedio */}
      <line x1={PADL} x2={W - PAD} y1={avgY} y2={avgY} stroke="#8CA18B" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={W - PAD - 2} y={avgY - 5} textAnchor="end" fontSize="9" fill="#6B8767" fontWeight="600">
        prom {avg.toFixed(1)} kWh
      </text>
      {data.map((d, i) => {
        const x = PADL + i * step + step / 2
        const hG = (d.kwh_guest / max) * chartH
        const hA = (d.kwh_admin / max) * chartH
        const total = d.kwh_guest + d.kwh_admin
        return (
          <g key={d.date}>
            <title>{`${d.date}: ${total.toFixed(1)} kWh total (huésped ${d.kwh_guest.toFixed(1)}, admin ${d.kwh_admin.toFixed(1)})`}</title>
            {d.kwh_admin > 0 && <rect x={x - bw / 2} y={PADL + chartH - hA} width={bw} height={Math.max(hA, 1)} rx="3" fill="#A8A8A8" />}
            {d.kwh_guest > 0 && <rect x={x - bw / 2} y={PADL + chartH - hA - hG} width={bw} height={Math.max(hG, 1)} rx="3" fill="#C16A54" />}
            <text x={x} y={PADL + chartH - hA - hG - 6} textAnchor="middle" fontSize="9.5" fill="#4a463f" fontWeight="600">
              {total > 0 ? total.toFixed(1) : ''}
            </text>
            <text x={x} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#A8A8A8">
              {d.date.slice(8)}
            </text>
          </g>
        )
      })}
      <g>
        <rect x={PADL} y={6} width="10" height="10" rx="2" fill="#C16A54" />
        <text x={PADL + 14} y={15} fontSize="10.5" fill="#4a463f">Huésped</text>
        <rect x={PADL + 78} y={6} width="10" height="10" rx="2" fill="#A8A8A8" />
        <text x={PADL + 92} y={15} fontSize="10.5" fill="#4a463f">Admin</text>
      </g>
    </svg>
  )
}

/** Barra horizontal proporcional para horas de uso. */
function UsageBar({ minutes, maxMinutes }: { minutes: number; maxMinutes: number }) {
  const pct = maxMinutes > 0 ? Math.min((minutes / maxMinutes) * 100, 100) : 0
  return <span className="usage-bar"><span className="usage-bar-fill" style={{ width: `${pct}%` }} /></span>
}

const DEVICE_ICON: Record<string, string> = {
  luz: '💡',
  llave: '🔑',
  presencia: '👀',
  calefaccion: '🔥',
  tv: '📺',
  energia: '⚡',
}

function lastSeenLabel(last: string | null): string {
  if (!last) return 'sin señal'
  const diff = Date.now() - Date.parse(last.replace(' ', 'T') + 'Z')
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

export default function DashboardTab({ properties }: { properties: Property[] }) {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [propertyId, setPropertyId] = useState<number | undefined>(undefined)
  const [fin, setFin] = useState<FinanceAnalytics | null>(null)
  const [smart, setSmart] = useState<SmartHomeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [smartDays, setSmartDays] = useState(7)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, s] = await Promise.all([
        api.getFinanceAnalytics(month, propertyId),
        api.getSmartHomeSummary(smartDays, propertyId),
      ])
      setFin(f)
      setSmart(s)
    } catch {
      setFin(null)
    } finally {
      setLoading(false)
    }
  }, [month, propertyId, smartDays])

  useEffect(() => { load() }, [load])

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = `${MONTHS_ES[Number(month.slice(5)) - 1]}. ${month.slice(0, 4)}`

  return (
    <div>
      <div className="toolbar">
        <h2>Dashboard</h2>
        <div className="calendar-nav">
          <button className="btn small ghost" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">←</button>
          <span className="month-label">{monthLabel}</span>
          <button className="btn small ghost" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">→</button>
        </div>
        <select value={propertyId ?? ''} onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : undefined)} aria-label="Propiedad">
          <option value="">Todas las propiedades</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading && <div className="alert info">Cargando analytics…</div>}

      {fin && (
        <>
          {/* Neto del mes */}
          <div className="stats-grid">
            <div className="stat-card neto">
              <b>Neto del mes</b>
              <span className={fin.net >= 0 ? 'pos' : 'neg'}>{fmtCLP(fin.net)}</span>
            </div>
            <div className="stat-card">
              <b>Ingresos</b>
              <span>{fmtCLP(fin.income)}</span>
            </div>
            <div className="stat-card">
              <b>Gastos generales</b>
              <span>{fmtCLP(fin.expenses_by_category.reduce((s, c) => s + c.total, 0))}</span>
            </div>
            <div className="stat-card">
              <b>Supermercado</b>
              <span>{fmtCLP(fin.supermarket_total)}</span>
            </div>
            <div className="stat-card">
              <b>Publicidad</b>
              <span>{fmtCLP(fin.ad_spend_total)}</span>
            </div>
          </div>

          {/* Serie mensual */}
          <section className="dashboard-section">
            <h3>Ingresos vs gastos (6 meses)</h3>
            <IncomeChart series={fin.monthly_series} />
          </section>

          <div className="dashboard-cols">
            {/* Gastos por categoría */}
            <section className="dashboard-section">
              <h3>Gastos por categoría</h3>
              {fin.expenses_by_category.length === 0 ? (
                <p className="hint">Sin gastos registrados este mes.</p>
              ) : (
                <ul className="cat-list">
                  {fin.expenses_by_category.map((c) => (
                    <li key={c.category}>
                      <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                      <b>{fmtCLP(c.total)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Publicidad por plataforma */}
            <section className="dashboard-section">
              <h3>Publicidad por plataforma</h3>
              {fin.social_by_platform.length === 0 ? (
                <p className="hint">Sin registros de publicidad este mes.</p>
              ) : (
                <table className="mini-table">
                  <thead>
                    <tr><th>Plataforma</th><th>Gasto</th><th>Conv.</th><th>Reservas</th><th>$/reserva</th></tr>
                  </thead>
                  <tbody>
                    {fin.social_by_platform.map((s) => (
                      <tr key={s.platform}>
                        <td>{PLATFORM_LABEL[s.platform] ?? s.platform}</td>
                        <td>{fmtCLP(s.ad_spend)}</td>
                        <td>{s.conversations}</td>
                        <td>{s.bookings}</td>
                        <td>{s.bookings > 0 ? fmtCLP(Math.round(s.ad_spend / s.bookings)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Top productos supermercado */}
            <section className="dashboard-section">
              <h3>Top supermercado</h3>
              {fin.top_products.length === 0 ? (
                <p className="hint">Sin compras registradas este mes.</p>
              ) : (
                <ul className="cat-list">
                  {fin.top_products.slice(0, 8).map((p) => (
                    <li key={p.product}>
                      <span>{p.product} <small>({p.times}×)</small></span>
                      <b>{fmtCLP(p.total)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* Domótica */}
      {smart && (
        <section className="dashboard-section">
          <div className="section-head">
            <h3>Domótica</h3>
            <div className="pill-group" role="group" aria-label="Período domótica">
              {[7, 14, 30].map((d) => (
                <button key={d} className={`pill ${smartDays === d ? 'active' : ''}`} onClick={() => setSmartDays(d)}>
                  {d} días
                </button>
              ))}
            </div>
          </div>

          {smart.devices.length === 0 ? (
            <p className="hint">Sin dispositivos registrados. Agrégalos desde la pestaña Gastos &amp; Redes → Domótica.</p>
          ) : (
            <>
              {/* Tarjetas de dispositivos en línea */}
              <div className="device-cards">
                {smart.devices.map((d) => {
                  const isOn = d.state === 'on' || d.state === 'true'
                  return (
                    <div key={d.id} className={`device-card ${isOn ? 'on' : ''}`}>
                      <span className="device-emoji">{DEVICE_ICON[d.type] ?? '🔌'}</span>
                      <div className="device-info">
                        <b>{d.name}</b>
                        <small>{d.room ?? DEVICE_TYPE_LABEL[d.type] ?? d.type}</small>
                      </div>
                      <span className={`device-state ${isOn ? 'on' : ''}`}>{isOn ? '● ON' : '●'}</span>
                      <small className="device-seen">{lastSeenLabel(d.last_seen)}</small>
                    </div>
                  )
                })}
              </div>

              {/* KPIs comparativos */}
              {(() => {
                const kwhGuest = smart.energy_daily.reduce((s, d) => s + d.kwh_guest, 0)
                const kwhAdmin = smart.admin_usage.kwh
                const costGuest = kwhGuest * smart.kwh_price
                const costAdmin = kwhAdmin * smart.kwh_price
                const total = kwhGuest + kwhAdmin
                const guestPct = total > 0 ? Math.round((kwhGuest / total) * 100) : 0
                const dayTotals = smart.energy_daily.map((d) => d.kwh_guest + d.kwh_admin)
                const peak = dayTotals.length ? Math.max(...dayTotals) : 0
                return (
                  <div className="stats-grid smarthome-grid">
                    <div className="stat-card accent">
                      <b>Huéspedes ({smartDays}d)</b>
                      <span>{kwhGuest.toFixed(1)} kWh</span>
                      <span className="stat-small">{fmtCLP(Math.round(costGuest))} · {guestPct}% del total</span>
                    </div>
                    <div className="stat-card">
                      <b>Admin ({smartDays}d)</b>
                      <span>{kwhAdmin.toFixed(1)} kWh</span>
                      <span className="stat-small">
                        {fmtCLP(Math.round(costAdmin))}
                        {smart.admin_usage.avg_kwh_day != null ? ` · ${smart.admin_usage.avg_kwh_day.toFixed(1)}/día` : ''}
                      </span>
                    </div>
                    <div className="stat-card">
                      <b>Pico diario</b>
                      <span>{peak > 0 ? peak.toFixed(1) : '—'} kWh</span>
                      <span className="stat-small">
                        {smart.admin_usage.avg_kwh_day != null && peak > 0
                          ? `${(peak / smart.admin_usage.avg_kwh_day).toFixed(1)}× consumo admin`
                          : ''}
                      </span>
                    </div>
                    <div className="stat-card">
                      <b>Tarifa</b>
                      <span className="stat-small">{fmtCLP(smart.kwh_price)}/kWh</span>
                    </div>
                  </div>
                )
              })()}

              {smart.energy_daily.length > 0 && (
                <div className="dashboard-section-inner">
                  <h4>Energía diaria — huésped vs admin</h4>
                  <EnergyChart data={smart.energy_daily} />
                </div>
              )}

              {/* Uso por estadía */}
              {smart.stays_usage.length > 0 && (
                <div className="dashboard-section-inner">
                  <h4>Uso por estadía</h4>
                  <table className="mini-table">
                    <thead>
                      <tr><th>Huésped</th><th>Fechas</th><th>Propiedad</th><th>kWh</th><th>Costo</th></tr>
                    </thead>
                    <tbody>
                      {smart.stays_usage.map((s) => (
                        <tr key={s.reservation_id}>
                          <td><b>{s.guest_name}</b> <small className="muted">{s.pnr}</small></td>
                          <td>{s.check_in.slice(5)} → {s.check_out.slice(5)}</td>
                          <td>{s.property_name}</td>
                          <td>{s.kwh > 0 ? s.kwh.toFixed(1) : '—'}</td>
                          <td>{s.kwh > 0 ? fmtCLP(s.cost_clp) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="dashboard-cols">
                {/* Uso por dispositivo con barras */}
                <div>
                  <h4>Uso por dispositivo ({smartDays}d)</h4>
                  {smart.device_usage.length === 0 ? (
                    <p className="hint">Sin lecturas aún.</p>
                  ) : (
                    (() => {
                      const maxMin = Math.max(...smart.device_usage.map((d) => d.minutes_on), 1)
                      return (
                        <ul className="device-usage-list">
                          {smart.device_usage.map((d) => (
                            <li key={d.name}>
                              <div className="usage-head">
                                <span>{DEVICE_ICON[d.type] ?? '🔌'} <b>{d.name}</b></span>
                                <span>{d.minutes_on > 0 ? `${(d.minutes_on / 60).toFixed(1)} h` : '—'}</span>
                              </div>
                              <UsageBar minutes={d.minutes_on} maxMinutes={maxMin} />
                            </li>
                          ))}
                        </ul>
                      )
                    })()
                  )}
                </div>

                {/* Eventos de llave */}
                <div>
                  <h4>Eventos de llave</h4>
                  {smart.key_events.length === 0 ? (
                    <p className="hint">Sin eventos de llave registrados.</p>
                  ) : (
                    <ul className="event-list">
                      {smart.key_events.map((e, i) => {
                        const isOpen = e.event_type.includes('open')
                        return (
                          <li key={i}>
                            <span className={`key-badge ${isOpen ? 'open' : ''}`}>{isOpen ? '🔓' : '🔒'}</span>
                            <span>
                              {isOpen ? 'Apertura' : 'Cierre'} {e.detail ? <span className="muted">· {e.detail}</span> : ''}
                              <br />
                              <small className="muted">{e.event_at.slice(0, 16).replace('T', ' ')} · {e.device}</small>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}