import { DatabaseSync } from 'node:sqlite'
import { rmSync } from 'node:fs'

try { rmSync('/qa-synth.db') } catch {}

const db = new DatabaseSync('/qa-synth.db')
db.exec(`CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL,
  subcategory TEXT,
  amount INTEGER NOT NULL,
  expense_date TEXT NOT NULL,
  vendor TEXT,
  description TEXT,
  created_at TEXT
)`)
const rows = [
  ['limpieza', 10000, '2026-08-05'],
  ['servicios', 50000, '2026-08-02'],
  ['marketing', 40000, '2026-08-10'],
  ['limpieza', 10000, '2026-08-20'],
  ['servicios', 15000, '2026-08-22'],
  ['otro_mes', 9999, '2026-07-30'],
]
for (const [c, a, d] of rows) {
  db.prepare("INSERT INTO expenses (property_id, category, amount, expense_date, created_at) VALUES (1, ?, ?, ?, 'x')").run(c, a, d)
}
db.close()

const { getExpenseRanking } = await import('/app/dist/db/finance.js')
const r = getExpenseRanking('2026-08', 1)
console.log('SYNTH_RANKING:', JSON.stringify(r))
const expected = [
  { category: 'servicios', total: 65000, percentage: 52 },
  { category: 'marketing', total: 40000, percentage: 32 },
  { category: 'limpieza', total: 20000, percentage: 16 },
]
let ok = true
if (r.ranking.length !== 3) ok = false
for (let i = 0; i < expected.length; i++) {
  const e = expected[i], g = r.ranking[i]
  if (!g || g.category !== e.category || g.total !== e.total || g.percentage !== e.percentage) { ok = false; console.log('MISMATCH at', i, g, e) }
}
console.log('SYNTH_ASSERT_OK=', ok)
console.log('SYNTH_TOTAL_EXPENSES=', r.total_expenses, 'recomputed=', Object.values(r.ranking).reduce((a, x) => a + x.total, 0))