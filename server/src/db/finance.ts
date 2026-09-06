import { DatabaseSync } from 'node:sqlite'
import { db } from './reservations.js'

/* ============ Esquema ============ */

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    category TEXT NOT NULL
      CHECK (category IN ('servicios','mantencion','comision','insumos','otro')),
    subcategory TEXT,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    expense_date TEXT NOT NULL,
    vendor TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
  CREATE INDEX IF NOT EXISTS idx_expenses_property ON expenses(property_id);

  CREATE TABLE IF NOT EXISTS supermarket_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    purchase_date TEXT NOT NULL,
    store TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sm_date ON supermarket_purchases(purchase_date);

  CREATE TABLE IF NOT EXISTS supermarket_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES supermarket_purchases(id) ON DELETE CASCADE,
    product TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'un'
      CHECK (unit IN ('un','kg','lt')),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sm_items_purchase ON supermarket_items(purchase_id);

  CREATE TABLE IF NOT EXISTS social_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL
      CHECK (platform IN ('instagram','facebook','whatsapp','airbnb','booking','otro')),
    stat_date TEXT NOT NULL,
    ad_spend INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    conversations INTEGER NOT NULL DEFAULT 0,
    bookings INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_social_date ON social_stats(stat_date);
`)

/* ============ Tipos ============ */

export type ExpenseCategory = 'servicios' | 'mantencion' | 'comision' | 'insumos' | 'otro'
export type SocialPlatform = 'instagram' | 'facebook' | 'whatsapp' | 'airbnb' | 'booking' | 'otro'

export interface ExpenseRow {
  id: number
  property_id: number
  category: ExpenseCategory
  subcategory: string | null
  amount: number
  expense_date: string
  vendor: string | null
  description: string | null
  created_at: string
}

export interface SupermarketPurchaseRow {
  id: number
  property_id: number
  purchase_date: string
  store: string
  total: number
  item_count: number
  created_at: string
}

export interface SupermarketItemRow {
  id: number
  purchase_id: number
  product: string
  quantity: number
  unit: 'un' | 'kg' | 'lt'
  unit_price: number
  subtotal: number
}

export interface SocialStatRow {
  id: number
  platform: SocialPlatform
  stat_date: string
  ad_spend: number
  reach: number
  conversations: number
  bookings: number
  notes: string | null
  created_at: string
}

/* ============ Gastos generales ============ */

export function createExpense(data: {
  property_id: number
  category: ExpenseCategory
  subcategory?: string
  amount: number
  expense_date: string
  vendor?: string
  description?: string
}): ExpenseRow {
  const info = db.prepare(`
    INSERT INTO expenses (property_id, category, subcategory, amount, expense_date, vendor, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.property_id, data.category, data.subcategory?.trim() || null,
    data.amount, data.expense_date, data.vendor?.trim() || null, data.description?.trim() || null,
  )
  return getExpenseById(Number(info.lastInsertRowid))!
}

export function getExpenseById(id: number): ExpenseRow | undefined {
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as unknown as ExpenseRow | undefined
}

export function listExpenses(opts: { from?: string; to?: string; propertyId?: number } = {}): ExpenseRow[] {
  const conds: string[] = []
  const args: (string | number)[] = []
  if (opts.from) { conds.push('expense_date >= ?'); args.push(opts.from) }
  if (opts.to) { conds.push('expense_date <= ?'); args.push(opts.to) }
  if (opts.propertyId) { conds.push('property_id = ?'); args.push(opts.propertyId) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC, id DESC`).all(...args) as unknown as ExpenseRow[]
}

export function deleteExpense(id: number): boolean {
  return db.prepare('DELETE FROM expenses WHERE id = ?').run(id).changes > 0
}

/* ============ Supermercado ============ */

export function createPurchase(data: {
  property_id: number
  purchase_date: string
  store: string
  items: { product: string; quantity: number; unit: 'un' | 'kg' | 'lt'; unit_price: number }[]
}): SupermarketPurchaseRow {
  const total = data.items.reduce((sum, it) => sum + Math.round(it.quantity * it.unit_price), 0)
  const run = (): number => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const info = db.prepare(`
        INSERT INTO supermarket_purchases (property_id, purchase_date, store, total)
        VALUES (?, ?, ?, ?)
      `).run(data.property_id, data.purchase_date, data.store.trim(), total)
      const purchaseId = Number(info.lastInsertRowid)
      const stmt = db.prepare(`
        INSERT INTO supermarket_items (purchase_id, product, quantity, unit, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      for (const it of data.items) {
        const subtotal = Math.round(it.quantity * it.unit_price)
        stmt.run(purchaseId, it.product.trim(), it.quantity, it.unit, it.unit_price, subtotal)
      }
      return purchaseId
    } finally {
      db.exec('COMMIT')
    }
  }
  const id = run()
  return getPurchaseById(id)!
}

export function getPurchaseById(id: number): SupermarketPurchaseRow | undefined {
  return db.prepare(`
    SELECT p.*, COUNT(i.id) AS item_count
    FROM supermarket_purchases p LEFT JOIN supermarket_items i ON i.purchase_id = p.id
    WHERE p.id = ? GROUP BY p.id
  `).get(id) as unknown as SupermarketPurchaseRow | undefined
}

export function listPurchases(opts: { from?: string; to?: string } = {}): SupermarketPurchaseRow[] {
  const conds: string[] = []
  const args: (string | number)[] = []
  if (opts.from) { conds.push('purchase_date >= ?'); args.push(opts.from) }
  if (opts.to) { conds.push('purchase_date <= ?'); args.push(opts.to) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return db.prepare(`
    SELECT p.*, COUNT(i.id) AS item_count
    FROM supermarket_purchases p LEFT JOIN supermarket_items i ON i.purchase_id = p.id
    ${where} GROUP BY p.id ORDER BY p.purchase_date DESC, p.id DESC
  `).all(...args) as unknown as SupermarketPurchaseRow[]
}

export function getPurchaseItems(purchaseId: number): SupermarketItemRow[] {
  return db.prepare('SELECT * FROM supermarket_items WHERE purchase_id = ? ORDER BY id').all(purchaseId) as unknown as SupermarketItemRow[]
}

export function deletePurchase(id: number): boolean {
  return db.prepare('DELETE FROM supermarket_purchases WHERE id = ?').run(id).changes > 0
}

/** Productos ya ingresados (para autocompletado del form). */
export function listProducts(): string[] {
  const rows = db.prepare(`
    SELECT product, COUNT(*) AS n FROM supermarket_items GROUP BY product ORDER BY n DESC, product LIMIT 50
  `).all() as { product: string }[]
  return rows.map((r) => r.product)
}

/* ============ Publicidad / Redes ============ */

export function createSocialStat(data: {
  platform: SocialPlatform
  stat_date: string
  ad_spend: number
  reach: number
  conversations: number
  bookings: number
  notes?: string
}): SocialStatRow {
  const info = db.prepare(`
    INSERT INTO social_stats (platform, stat_date, ad_spend, reach, conversations, bookings, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.platform, data.stat_date, data.ad_spend ?? 0, data.reach ?? 0,
    data.conversations ?? 0, data.bookings ?? 0, data.notes?.trim() || null,
  )
  return getSocialStatById(Number(info.lastInsertRowid))!
}

export function getSocialStatById(id: number): SocialStatRow | undefined {
  return db.prepare('SELECT * FROM social_stats WHERE id = ?').get(id) as unknown as SocialStatRow | undefined
}

export function listSocialStats(opts: { from?: string; to?: string } = {}): SocialStatRow[] {
  const conds: string[] = []
  const args: (string | number)[] = []
  if (opts.from) { conds.push('stat_date >= ?'); args.push(opts.from) }
  if (opts.to) { conds.push('stat_date <= ?'); args.push(opts.to) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM social_stats ${where} ORDER BY stat_date DESC, id DESC`).all(...args) as unknown as SocialStatRow[]
}

export function deleteSocialStat(id: number): boolean {
  return db.prepare('DELETE FROM social_stats WHERE id = ?').run(id).changes > 0
}

/* ============ Analytics mensuales ============ */

export interface FinanceSummary {
  month: string
  income: number
  expenses_by_category: { category: string; total: number }[]
  supermarket_total: number
  ad_spend_total: number
  expenses_total: number
  net: number
}

/** Resumen financiero del mes: ingresos (reservas) − gastos − supermercado − publicidad. */
export function getFinanceSummary(month: string, propertyId?: number): FinanceSummary {
  const from = `${month}-01`
  const nextMonth = new Date(Date.parse(from) + 32 * 86400000)
  const to = `${nextMonth.toISOString().slice(0, 7)}-01`

  const propFilter = propertyId ? 'AND property_id = ?' : ''
  const args = propertyId ? [propertyId] : []

  const income = (db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS total FROM reservations
    WHERE status IN ('pendiente','confirmada','finalizada')
      AND check_in >= ? AND check_in < ? ${propFilter}
  `).get(from, to, ...args) as { total: number }).total

  const byCategory = db.prepare(`
    SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE expense_date >= ? AND expense_date < ? ${propFilter}
    GROUP BY category ORDER BY total DESC
  `).all(from, to, ...args) as unknown as { category: string; total: number }[]

  const supermarket = (db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total FROM supermarket_purchases
    WHERE purchase_date >= ? AND purchase_date < ? ${propFilter}
  `).get(from, to, ...args) as { total: number }).total

  const adSpend = (db.prepare(`
    SELECT COALESCE(SUM(ad_spend), 0) AS total FROM social_stats
    WHERE stat_date >= ? AND stat_date < ?
  `).get(from, to) as { total: number }).total

  const expensesTotal = byCategory.reduce((s, c) => s + c.total, 0)
  return {
    month,
    income,
    expenses_by_category: byCategory,
    supermarket_total: supermarket,
    ad_spend_total: adSpend,
    expenses_total: expensesTotal + supermarket + adSpend,
    net: income - expensesTotal - supermarket - adSpend,
  }
}

/** Top productos del período (supermercado). */
export function getTopProducts(from: string, to: string, limit = 10): { product: string; total: number; times: number }[] {
  return db.prepare(`
    SELECT i.product, SUM(i.subtotal) AS total, COUNT(*) AS times
    FROM supermarket_items i JOIN supermarket_purchases p ON p.id = i.purchase_id
    WHERE p.purchase_date >= ? AND p.purchase_date <= ?
    GROUP BY i.product ORDER BY total DESC LIMIT ?
  `).all(from, to, limit) as unknown as { product: string; total: number; times: number }[]
}

/** Publicidad por plataforma del período. */
export function getSocialPlatformStats(from: string, to: string): {
  platform: string
  ad_spend: number
  reach: number
  conversations: number
  bookings: number
}[] {
  return db.prepare(`
    SELECT platform, SUM(ad_spend) AS ad_spend, SUM(reach) AS reach,
           SUM(conversations) AS conversations, SUM(bookings) AS bookings
    FROM social_stats WHERE stat_date >= ? AND stat_date <= ?
    GROUP BY platform ORDER BY ad_spend DESC
  `).all(from, to) as unknown as {
    platform: string
    ad_spend: number
    reach: number
    conversations: number
    bookings: number
  }[]
}

/** Serie mensual de ingresos vs gastos (últimos N meses, para chart). */
export function getMonthlySeries(months = 6, propertyId?: number): {
  month: string
  income: number
  expenses: number
}[] {
  const series: { month: string; income: number; expenses: number }[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const month = d.toISOString().slice(0, 7)
    const s = getFinanceSummary(month, propertyId)
    series.push({ month, income: s.income, expenses: s.expenses_total })
  }
  return series
}