import { Router, type Request, type Response } from 'express'
import {
  createExpense, listExpenses, deleteExpense,
  createPurchase, listPurchases, getPurchaseItems, deletePurchase, listProducts,
  createSocialStat, listSocialStats, deleteSocialStat,
  getFinanceSummary, getTopProducts, getSocialPlatformStats, getMonthlySeries,
  type ExpenseCategory, type SocialPlatform,
} from '../db/finance.js'

export const financeRouter = Router()

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['servicios', 'mantencion', 'comision', 'insumos', 'otro']
const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'whatsapp', 'airbnb', 'booking', 'otro']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* ============ Gastos generales ============ */

/** POST /api/expenses */
financeRouter.post('/expenses', (req: Request, res: Response) => {
  const { property_id, category, subcategory, amount, expense_date, vendor, description } = req.body ?? {}
  if (!property_id || !category || !amount || !expense_date) {
    return res.status(400).json({ error: 'Propiedad, categoría, monto y fecha son obligatorios' })
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoría inválida' })
  }
  if (category === 'servicios' && !subcategory?.trim()) {
    return res.status(400).json({ error: 'Indica el servicio (luz, agua, gas, internet)' })
  }
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Monto inválido' })
  }
  if (!DATE_RE.test(String(expense_date))) {
    return res.status(400).json({ error: 'Fecha inválida' })
  }
  res.status(201).json(createExpense({
    property_id: Number(property_id),
    category,
    subcategory,
    amount: Math.round(amt),
    expense_date: String(expense_date),
    vendor,
    description,
  }))
})

/** GET /api/expenses?from&to&property_id */
financeRouter.get('/expenses', (req, res) => {
  res.json(listExpenses({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    propertyId: req.query.property_id ? Number(req.query.property_id) : undefined,
  }))
})

/** DELETE /api/expenses/:id */
financeRouter.delete('/expenses/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  if (!deleteExpense(id)) return res.status(404).json({ error: 'Gasto no encontrado' })
  res.status(204).end()
})

/* ============ Supermercado ============ */

/** POST /api/supermarket — compra con items. */
financeRouter.post('/supermarket', (req: Request, res: Response) => {
  const { property_id, purchase_date, store, items } = req.body ?? {}
  if (!property_id || !purchase_date || !store?.trim()) {
    return res.status(400).json({ error: 'Propiedad, fecha y tienda son obligatorios' })
  }
  if (!DATE_RE.test(String(purchase_date))) {
    return res.status(400).json({ error: 'Fecha inválida' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agrega al menos un producto' })
  }
  for (const it of items) {
    const qty = Number(it.quantity ?? 1)
    const price = Number(it.unit_price)
    if (!it.product?.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Item inválido: revisa producto, cantidad y precio' })
    }
    if (!['un', 'kg', 'lt'].includes(it.unit ?? 'un')) {
      return res.status(400).json({ error: `Unidad inválida para "${it.product}"` })
    }
  }
  res.status(201).json(createPurchase({
    property_id: Number(property_id),
    purchase_date: String(purchase_date),
    store: String(store),
    items: items.map((it: { product: string; quantity: number; unit: 'un' | 'kg' | 'lt'; unit_price: number }) => ({
      product: String(it.product),
      quantity: Number(it.quantity ?? 1),
      unit: it.unit ?? 'un',
      unit_price: Number(it.unit_price),
    })),
  }))
})

/** GET /api/supermarket?from&to */
financeRouter.get('/supermarket', (req, res) => {
  res.json(listPurchases({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  }))
})

/** GET /api/supermarket/products — autocompletado. */
financeRouter.get('/supermarket/products', (_req, res) => {
  res.json(listProducts())
})

/** GET /api/supermarket/:id/items */
financeRouter.get('/supermarket/:id/items', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  res.json(getPurchaseItems(id))
})

/** DELETE /api/supermarket/:id */
financeRouter.delete('/supermarket/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  if (!deletePurchase(id)) return res.status(404).json({ error: 'Compra no encontrada' })
  res.status(204).end()
})

/* ============ Publicidad / Redes ============ */

/** POST /api/social */
financeRouter.post('/social', (req: Request, res: Response) => {
  const { platform, stat_date, ad_spend, reach, conversations, bookings, notes } = req.body ?? {}
  if (!platform || !stat_date) {
    return res.status(400).json({ error: 'Plataforma y fecha son obligatorias' })
  }
  if (!SOCIAL_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Plataforma inválida' })
  }
  if (!DATE_RE.test(String(stat_date))) {
    return res.status(400).json({ error: 'Fecha inválida' })
  }
  const nums = { ad_spend: Number(ad_spend ?? 0), reach: Number(reach ?? 0), conversations: Number(conversations ?? 0), bookings: Number(bookings ?? 0) }
  if (Object.values(nums).some((n) => !Number.isFinite(n) || n < 0)) {
    return res.status(400).json({ error: 'Valores numéricos inválidos' })
  }
  res.status(201).json(createSocialStat({ platform, stat_date: String(stat_date), ...nums, notes }))
})

/** GET /api/social?from&to */
financeRouter.get('/social', (req, res) => {
  res.json(listSocialStats({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  }))
})

/** DELETE /api/social/:id */
financeRouter.delete('/social/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  if (!deleteSocialStat(id)) return res.status(404).json({ error: 'Registro no encontrado' })
  res.status(204).end()
})

/* ============ Analytics (Dashboard) ============ */

/** GET /api/analytics/finance?month=YYYY-MM&property_id */
financeRouter.get('/analytics/finance', (req, res) => {
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Mes inválido' })
  const propertyId = req.query.property_id ? Number(req.query.property_id) : undefined
  const summary = getFinanceSummary(month, propertyId)
  const monthStart = `${month}-01`
  const monthEnd = month.slice(0, 8) + String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()).padStart(2, '0')
  res.json({
    ...summary,
    top_products: getTopProducts(monthStart, monthEnd),
    social_by_platform: getSocialPlatformStats(monthStart, monthEnd),
    monthly_series: getMonthlySeries(6, propertyId),
  })
})