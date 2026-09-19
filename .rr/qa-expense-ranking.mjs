import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('/qa-copy.db', { readOnly: true })

const months = db.prepare(
  "SELECT substr(expense_date,1,7) AS m, COUNT(*) AS n, ROUND(SUM(amount),0) AS t FROM expenses GROUP BY m ORDER BY m DESC LIMIT 8"
).all()
console.log('MONTHS(desc):', JSON.stringify(months))

const expSchema = db.prepare("SELECT * FROM expenses LIMIT 3").all()
console.log('SAMPLE_ROWS:', JSON.stringify(expSchema))

const month = months[0]?.m
if (!month) throw new Error('no expenses in copy db')
console.log('TEST_MONTH:', month)

db.close()

const { getExpenseRanking } = await import('/app/dist/db/finance.js')
const result = getExpenseRanking(month, undefined)
console.log('RANKING_RESULT:', JSON.stringify(result, null, 2))

const rows = result.ranking
const sum = rows.reduce((a, r) => a + r.total, 0)
console.log('CHECK_total_expenses=', result.total_expenses, 'recomputed=', Math.round(sum))

let orderOk = true
for (let i = 1; i < rows.length; i++) if (rows[i].total > rows[i - 1].total) orderOk = false
console.log('CHECK_desc_order_ok=', orderOk)

let pctOk = true
for (const r of rows) {
  const expected = result.total_expenses ? Math.round((r.total / result.total_expenses) * 1000) / 10 : 0
  if (r.percentage !== expected) pctOk = false
}
console.log('CHECK_percentage_1decimal_ok=', pctOk)
console.log('PCT_SUM=', rows.reduce((a, r) => a + r.percentage, 0).toFixed(1))

const empty = getExpenseRanking('1999-01', 1)
console.log('EMPTY_MONTH:', JSON.stringify(empty))

let caught = null
try {
  getExpenseRanking('2026/08', 1)
} catch (e) {
  caught = e.message
}
console.log('INVALID_MONTH_ERROR=', caught)

const def = getExpenseRanking(new Date().toISOString().slice(0, 7), undefined)
console.log('CURRENT_MONTH_OK=', def.month === new Date().toISOString().slice(0, 7))