import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type {
  Property, Expense, ExpenseCategory, SupermarketPurchase, SocialStat,
  SocialPlatform, SmartDevice, SmartDeviceType, SupermarketItem,
} from '../types'

function fmtCLP(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  servicios: 'Servicios básicos',
  mantencion: 'Mantención',
  comision: 'Comisión plataforma',
  insumos: 'Insumos',
  otro: 'Otro',
}

const SERVICE_SUBCATS = ['luz', 'agua', 'gas', 'internet'] as const

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  airbnb: 'Airbnb',
  booking: 'Booking',
  otro: 'Otro',
}

const DEVICE_TYPES: { value: SmartDeviceType; label: string }[] = [
  { value: 'luz', label: 'Luz' },
  { value: 'llave', label: 'Llave electrónica' },
  { value: 'presencia', label: 'Sensor de presencia' },
  { value: 'calefaccion', label: 'Calefacción' },
  { value: 'tv', label: 'Televisor' },
  { value: 'energia', label: 'Medidor de energía' },
]

const DEVICE_TYPE_LABEL: Record<string, string> = Object.fromEntries(DEVICE_TYPES.map((d) => [d.value, d.label]))

type Section = 'gastos' | 'supermercado' | 'publicidad' | 'domotica'

export default function GastosRedesTab({ properties }: { properties: Property[] }) {
  const [section, setSection] = useState<Section>('gastos')

  return (
    <div>
      <h2>Gastos &amp; Redes</h2>
      <div className="subtabs">
        {([['gastos', 'Gastos generales'], ['supermercado', 'Supermercado'], ['publicidad', 'Publicidad'], ['domotica', 'Domótica']] as [Section, string][]).map(([key, label]) => (
          <button key={key} className={`subtab ${section === key ? 'active' : ''}`} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </div>

      {section === 'gastos' && <GastosSection properties={properties} />}
      {section === 'supermercado' && <SupermercadoSection properties={properties} />}
      {section === 'publicidad' && <PublicidadSection />}
      {section === 'domotica' && <DomoticaSection properties={properties} />}
    </div>
  )
}

/* ============ Gastos generales ============ */

function GastosSection({ properties }: { properties: Property[] }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState({
    property_id: '',
    category: 'servicios' as ExpenseCategory,
    subcategory: 'luz',
    amount: '',
    expense_date: today(),
    vendor: '',
    description: '',
  })

  const load = useCallback(async () => {
    try {
      setExpenses(await api.listExpenses())
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (properties.length && !form.property_id) setForm((f) => ({ ...f, property_id: String(properties[0].id) }))
  }, [properties])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    try {
      await api.createExpense({
        property_id: Number(form.property_id),
        category: form.category,
        subcategory: form.category === 'servicios' ? form.subcategory : undefined,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        vendor: form.vendor || undefined,
        description: form.description || undefined,
      })
      setShowForm(false)
      setForm((f) => ({ ...f, amount: '', vendor: '', description: '' }))
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function del(id: number) {
    if (!confirm('¿Eliminar este gasto?')) return
    await api.deleteExpense(id)
    await load()
  }

  return (
    <div>
      <div className="toolbar">
        <p className="hint">Servicios (luz, agua, gas, internet), mantención, comisiones e insumos.</p>
        <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nuevo gasto'}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={save}>
          {err && <div className="alert error">{err}</div>}
          <div className="field-row">
            <div className="field">
              <label htmlFor="e-prop">Propiedad</label>
              <select id="e-prop" required value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-cat">Categoría</label>
              <select id="e-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            {form.category === 'servicios' && (
              <div className="field">
                <label htmlFor="e-sub">Servicio</label>
                <select id="e-sub" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}>
                  {SERVICE_SUBCATS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="e-amount">Monto (CLP)</label>
              <input id="e-amount" type="number" min="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="e-date">Fecha</label>
              <input id="e-date" type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="e-vendor">Proveedor (opcional)</label>
              <input id="e-vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="e-desc">Descripción (opcional)</label>
            <input id="e-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar gasto'}</button>
        </form>
      )}

      {expenses.length === 0 ? (
        <div className="alert info">Sin gastos registrados todavía.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Propiedad</th><th>Categoría</th><th>Detalle</th><th>Monto</th><th></th></tr>
            </thead>
            <tbody>
              {expenses.map((x) => (
                <tr key={x.id}>
                  <td>{x.expense_date}</td>
                  <td>{properties.find((p) => p.id === x.property_id)?.name ?? '—'}</td>
                  <td>{CATEGORY_LABEL[x.category] ?? x.category}{x.subcategory ? ` · ${x.subcategory}` : ''}</td>
                  <td>{x.description ?? x.vendor ?? '—'}</td>
                  <td>{fmtCLP(x.amount)}</td>
                  <td className="actions">
                    <button className="btn small danger" onClick={() => del(x.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ============ Supermercado ============ */

interface ItemDraft {
  product: string
  quantity: string
  unit: 'un' | 'kg' | 'lt'
  unit_price: string
}

function SupermercadoSection({ properties }: { properties: Property[] }) {
  const [purchases, setPurchases] = useState<SupermarketPurchase[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [products, setProducts] = useState<string[]>([])
  const [detail, setDetail] = useState<{ purchase: SupermarketPurchase; items: SupermarketItem[] } | null>(null)

  const [head, setHead] = useState({
    property_id: '',
    purchase_date: today(),
    store: '',
  })
  const [items, setItems] = useState<ItemDraft[]>([{ product: '', quantity: '1', unit: 'un', unit_price: '' }])

  const load = useCallback(async () => {
    try {
      const [ps, prods] = await Promise.all([api.listPurchases(), api.listProducts()])
      setPurchases(ps)
      setProducts(prods)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (properties.length && !head.property_id) setHead((h) => ({ ...h, property_id: String(properties[0].id) }))
  }, [properties])

  const draftTotal = items.reduce((s, it) => {
    const q = Number(it.quantity || '0')
    const p = Number(it.unit_price || '0')
    return s + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0)
  }, 0)

  function setItem(i: number, patch: Partial<ItemDraft>) {
    setItems((its) => its.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const clean = items.filter((it) => it.product.trim())
    if (clean.length === 0) {
      setErr('Agrega al menos un producto')
      return
    }
    setSaving(true)
    try {
      await api.createPurchase({
        property_id: Number(head.property_id),
        purchase_date: head.purchase_date,
        store: head.store,
        items: clean.map((it) => ({
          product: it.product.trim(),
          quantity: Number(it.quantity || '1'),
          unit: it.unit,
          unit_price: Number(it.unit_price || '0'),
        })),
      })
      setShowForm(false)
      setHead((h) => ({ ...h, store: '' }))
      setItems([{ product: '', quantity: '1', unit: 'un', unit_price: '' }])
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function openDetail(p: SupermarketPurchase) {
    const items = await api.getPurchaseItems(p.id)
    setDetail({ purchase: p, items })
  }

  async function del(id: number) {
    if (!confirm('¿Eliminar esta compra y todos sus items?')) return
    await api.deletePurchase(id)
    setDetail(null)
    await load()
  }

  return (
    <div>
      <div className="toolbar">
        <p className="hint">Compras con itemizado producto a producto.</p>
        <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nueva compra'}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={save}>
          {err && <div className="alert error">{err}</div>}
          <div className="field-row">
            <div className="field">
              <label htmlFor="s-prop">Propiedad</label>
              <select id="s-prop" required value={head.property_id} onChange={(e) => setHead({ ...head, property_id: e.target.value })}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-date">Fecha</label>
              <input id="s-date" type="date" required value={head.purchase_date} onChange={(e) => setHead({ ...head, purchase_date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="s-store">Tienda</label>
              <input id="s-store" required placeholder="Líder, Jumbo…" value={head.store} onChange={(e) => setHead({ ...head, store: e.target.value })} />
            </div>
          </div>

          <h4>Productos</h4>
          {items.map((it, i) => (
            <div className="field-row item-row" key={i}>
              <div className="field grow">
                <label htmlFor={`si-${i}`}>Producto</label>
                <input id={`si-${i}`} list="product-list" required value={it.product} onChange={(e) => setItem(i, { product: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`sq-${i}`}>Cant.</label>
                <input id={`sq-${i}`} type="number" min="0" step="0.1" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`su-${i}`}>Unidad</label>
                <select id={`su-${i}`} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value as ItemDraft['unit'] })}>
                  <option value="un">un</option>
                  <option value="kg">kg</option>
                  <option value="lt">lt</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`sp-${i}`}>$/unidad</label>
                <input id={`sp-${i}`} type="number" min="0" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} />
              </div>
              <button type="button" className="btn small danger item-del" aria-label="Quitar"
                onClick={() => setItems((its) => its.length > 1 ? its.filter((_, idx) => idx !== i) : its)}>✕</button>
            </div>
          ))}
          <datalist id="product-list">
            {products.map((p) => <option key={p} value={p} />)}
          </datalist>
          <div className="actions-row">
            <button type="button" className="btn ghost small" onClick={() => setItems((its) => [...its, { product: '', quantity: '1', unit: 'un', unit_price: '' }])}>+ Producto</button>
            <span className="draft-total">Total: <strong>{fmtCLP(Math.round(draftTotal))}</strong></span>
          </div>

          <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar compra'}</button>
        </form>
      )}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{detail.purchase.store} · {detail.purchase.purchase_date}</h3>
            <table className="mini-table">
              <thead><tr><th>Producto</th><th>Cant.</th><th>$/un</th><th>Subtotal</th></tr></thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.product}</td>
                    <td>{it.quantity} {it.unit}</td>
                    <td>{fmtCLP(it.unit_price)}</td>
                    <td>{fmtCLP(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="price-summary">
              <span>Total</span>
              <span className="total">{fmtCLP(detail.purchase.total)}</span>
            </div>
            <div className="actions-row">
              <button className="btn ghost" onClick={() => setDetail(null)}>Cerrar</button>
              <button className="btn danger" onClick={() => del(detail.purchase.id)}>Eliminar compra</button>
            </div>
          </div>
        </div>
      )}

      {purchases.length === 0 ? (
        <div className="alert info">Sin compras registradas todavía.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tienda</th><th>Items</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.purchase_date}</td>
                  <td>{p.store}</td>
                  <td>{p.item_count}</td>
                  <td>{fmtCLP(p.total)}</td>
                  <td className="actions">
                    <button className="btn small ghost" onClick={() => openDetail(p)}>Ver</button>
                    <button className="btn small danger" onClick={() => del(p.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ============ Publicidad ============ */

function PublicidadSection() {
  const [stats, setStats] = useState<SocialStat[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState({
    platform: 'instagram' as SocialPlatform,
    stat_date: today(),
    ad_spend: '',
    reach: '',
    conversations: '',
    bookings: '',
    notes: '',
  })

  const load = useCallback(async () => {
    try {
      setStats(await api.listSocialStats())
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    try {
      await api.createSocialStat({
        platform: form.platform,
        stat_date: form.stat_date,
        ad_spend: Number(form.ad_spend || '0'),
        reach: Number(form.reach || '0'),
        conversations: Number(form.conversations || '0'),
        bookings: Number(form.bookings || '0'),
        notes: form.notes || undefined,
      })
      setShowForm(false)
      setForm((f) => ({ ...f, ad_spend: '', reach: '', conversations: '', bookings: '', notes: '' }))
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function del(id: number) {
    if (!confirm('¿Eliminar este registro?')) return
    await api.deleteSocialStat(id)
    await load()
  }

  return (
    <div>
      <div className="toolbar">
        <p className="hint">Gasto publicitario, alcance, conversaciones y reservas por plataforma.</p>
        <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nuevo registro'}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={save}>
          {err && <div className="alert error">{err}</div>}
          <div className="field-row">
            <div className="field">
              <label htmlFor="p-platform">Plataforma</label>
              <select id="p-platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as SocialPlatform })}>
                {(Object.keys(PLATFORM_LABEL) as SocialPlatform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="p-date">Fecha</label>
              <input id="p-date" type="date" required value={form.stat_date} onChange={(e) => setForm({ ...form, stat_date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p-spend">Gasto (CLP)</label>
              <input id="p-spend" type="number" min="0" value={form.ad_spend} onChange={(e) => setForm({ ...form, ad_spend: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="p-reach">Alcance</label>
              <input id="p-reach" type="number" min="0" value={form.reach} onChange={(e) => setForm({ ...form, reach: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p-conv">Conversaciones</label>
              <input id="p-conv" type="number" min="0" value={form.conversations} onChange={(e) => setForm({ ...form, conversations: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p-book">Reservas</label>
              <input id="p-book" type="number" min="0" value={form.bookings} onChange={(e) => setForm({ ...form, bookings: e.target.value })} />
            </div>
          </div>
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar registro'}</button>
        </form>
      )}

      {stats.length === 0 ? (
        <div className="alert info">Sin registros de publicidad todavía.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Plataforma</th><th>Gasto</th><th>Alcance</th><th>Conversaciones</th><th>Reservas</th><th></th></tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.id}>
                  <td>{s.stat_date}</td>
                  <td>{PLATFORM_LABEL[s.platform] ?? s.platform}</td>
                  <td>{fmtCLP(s.ad_spend)}</td>
                  <td>{s.reach}</td>
                  <td>{s.conversations}</td>
                  <td>{s.bookings}</td>
                  <td className="actions">
                    <button className="btn small danger" onClick={() => del(s.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ============ Domótica ============ */

function DomoticaSection({ properties }: { properties: Property[] }) {
  const [devices, setDevices] = useState<SmartDevice[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const [form, setForm] = useState({
    property_id: '',
    name: '',
    type: 'luz' as SmartDeviceType,
    room: '',
  })

  const load = useCallback(async () => {
    try {
      setDevices(await api.listSmartDevices())
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (properties.length && !form.property_id) setForm((f) => ({ ...f, property_id: String(properties[0].id) }))
  }, [properties])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    try {
      await api.createSmartDevice({
        property_id: Number(form.property_id),
        name: form.name,
        type: form.type,
        room: form.room || undefined,
      })
      setShowForm(false)
      setForm((f) => ({ ...f, name: '', room: '' }))
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function del(id: number) {
    if (!confirm('¿Eliminar este dispositivo? Sus lecturas y eventos también se borrarán.')) return
    await api.deleteSmartDevice(id)
    await load()
  }

  async function rotate(id: number) {
    if (!confirm('¿Regenerar la API key? El dispositivo deberá actualizarse con la nueva clave.')) return
    await api.rotateApiKey(id)
    await load()
  }

  async function copyKey(id: number, key: string) {
    await navigator.clipboard.writeText(key)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      <div className="toolbar">
        <p className="hint">Registra tus dispositivos ESP32. Cada uno recibe una API key para reportar lecturas a <code>POST /api/smarthome/ingest</code>.</p>
        <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nuevo dispositivo'}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={save}>
          {err && <div className="alert error">{err}</div>}
          <div className="field-row">
            <div className="field">
              <label htmlFor="d-prop">Propiedad</label>
              <select id="d-prop" required value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field grow">
              <label htmlFor="d-name">Nombre</label>
              <input id="d-name" required placeholder="Luz living, Calefacción…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="d-type">Tipo</label>
              <select id="d-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SmartDeviceType })}>
                {DEVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="d-room">Habitación</label>
              <input id="d-room" placeholder="Living, dorm 1…" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </div>
          </div>
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar dispositivo'}</button>
        </form>
      )}

      {devices.length === 0 ? (
        <div className="alert info">Sin dispositivos registrados todavía.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Dispositivo</th><th>Tipo</th><th>Habitación</th><th>API key</th><th>Última señal</th><th></th></tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{DEVICE_TYPE_LABEL[d.type] ?? d.type}</td>
                  <td>{d.room ?? '—'}</td>
                  <td>
                    <code className="api-key" title={d.api_key}>{d.api_key.slice(0, 10)}…</code>
                    <button className="btn small ghost" onClick={() => copyKey(d.id, d.api_key)}>
                      {copied === d.id ? '✓ Copiada' : 'Copiar'}
                    </button>
                  </td>
                  <td>{d.last_seen ? d.last_seen.replace('T', ' ').slice(0, 16) : '—'}</td>
                  <td className="actions">
                    <button className="btn small ghost" onClick={() => rotate(d.id)}>Regenerar key</button>
                    <button className="btn small danger" onClick={() => del(d.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}