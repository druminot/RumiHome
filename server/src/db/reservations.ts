import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface PropertyRow {
  id: number
  name: string
  address: string
  max_guests: number
  base_price_per_night: number | null
  active: number
  created_at: string
}

export interface ReservationRow {
  id: number
  pnr: string
  property_id: number
  guest_name: string
  guest_rut: string
  guest_email: string | null
  guest_phone: string | null
  arrival_time: string | null
  check_in: string
  check_out: string
  guests: number
  price_per_night: number | null
  total_price: number | null
  door_code: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

const DB_PATH = process.env.DB_PATH ?? '/data/rumihome.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    max_guests INTEGER NOT NULL DEFAULT 2,
    base_price_per_night INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pnr TEXT NOT NULL UNIQUE,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    guest_name TEXT NOT NULL,
    guest_rut TEXT NOT NULL,
    guest_email TEXT,
    guest_phone TEXT,
    arrival_time TEXT,
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1,
    price_per_night INTEGER,
    total_price INTEGER,
    door_code TEXT,
    status TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (status IN ('pendiente','confirmada','cancelada','finalizada')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reservations_rut ON reservations(guest_rut);
  CREATE INDEX IF NOT EXISTS idx_reservations_pnr ON reservations(pnr);
`)

/** Migración ALTER para añadir door_code a instalaciones existentes. */
function migrateDoorCode(): void {
  const cols = db.prepare("PRAGMA table_info('reservations')").all() as { name: string }[]
  if (cols.length && !cols.some((c) => c.name === 'door_code')) {
    db.exec('ALTER TABLE reservations ADD COLUMN door_code TEXT')
  }
}

/** Migración desde esquema previo (sin property_id / precios). */
function migrateLegacySchema(): void {
  const cols = db.prepare("PRAGMA table_info('reservations')").all() as { name: string }[]
  const names = cols.map((c) => c.name)
  if (names.length && !names.includes('property_id')) {
    db.exec(`
      BEGIN;
      ALTER TABLE reservations RENAME TO reservations_legacy;
      CREATE TABLE reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pnr TEXT NOT NULL UNIQUE,
        property_id INTEGER NOT NULL DEFAULT 1 REFERENCES properties(id),
        guest_name TEXT NOT NULL,
        guest_rut TEXT NOT NULL,
        guest_email TEXT,
        guest_phone TEXT,
        arrival_time TEXT,
        check_in TEXT NOT NULL,
        check_out TEXT NOT NULL,
        guests INTEGER NOT NULL DEFAULT 1,
        price_per_night INTEGER,
        total_price INTEGER,
        status TEXT NOT NULL DEFAULT 'pendiente'
          CHECK (status IN ('pendiente','confirmada','cancelada','finalizada')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO reservations (id, pnr, property_id, guest_name, guest_rut, guest_email, guest_phone, arrival_time, check_in, check_out, guests, price_per_night, total_price, status, notes, created_at, updated_at)
        SELECT id, pnr, 1, guest_name, guest_rut, guest_email, guest_phone, NULL, check_in, check_out, guests, NULL, NULL, status, notes, created_at, updated_at
        FROM reservations_legacy;
      DROP TABLE reservations_legacy;
      COMMIT;
    `)
  }
}

/** Propiedad por defecto si la tabla está vacía. */
function ensureDefaultProperty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM properties').get() as { n: number }).n
  if (count === 0) {
    db.prepare(
      `INSERT INTO properties (name, address, max_guests, base_price_per_night)
       VALUES (?, ?, ?, ?)`,
    ).run(
      process.env.DEFAULT_PROPERTY_NAME ?? 'Departamento Concepción',
      process.env.DEFAULT_PROPERTY_ADDRESS ?? 'Concepción, Chile',
      Number(process.env.DEFAULT_PROPERTY_MAX_GUESTS ?? 4),
      process.env.DEFAULT_PROPERTY_PRICE ? Number(process.env.DEFAULT_PROPERTY_PRICE) : null,
    )
  }
}

ensureDefaultProperty()
migrateLegacySchema()
migrateDoorCode()

// Índice que referencia property_id: solo tras la migración del esquema legacy
db.exec('CREATE INDEX IF NOT EXISTS idx_reservations_property_dates ON reservations(property_id, check_in, check_out)')

/** Genera un PNR legible tipo RUMI-XXXXXX (sin caracteres ambiguos). */
export function generatePnr(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let code = ''
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return `RUMI-${code}`
}

/** Clave numérica de puerta: 4-6 dígitos aleatorios. */
export function generateDoorCode(): string {
  return String(1000 + (randomBytes(4).readUInt32BE(0) % 900000)).padStart(4, '0').slice(0, 6)
}

export function listProperties(): PropertyRow[] {
  return db
    .prepare('SELECT * FROM properties WHERE active = 1 ORDER BY id')
    .all() as unknown as PropertyRow[]
}

export function getProperty(id: number): PropertyRow | undefined {
  return db.prepare('SELECT * FROM properties WHERE id = ?').get(id) as unknown as PropertyRow | undefined
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000)
}

/** True si hay otra reserva ACTIVA que se solape con el rango dado en la propiedad. */
export function hasOverlap(
  propertyId: number,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: number,
): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM reservations
       WHERE property_id = ?
         AND status IN ('pendiente','confirmada')
         AND check_out > ? AND check_in < ?
         AND id != COALESCE(?, -1)`,
    )
    .get(propertyId, checkIn, checkOut, excludeReservationId ?? -1) as { n: number }
  return row.n > 0
}

function computeTotals(
  pricePerNight: number | null,
  checkIn: string,
  checkOut: string,
): { price_per_night: number | null; total_price: number | null } {
  if (pricePerNight == null) return { price_per_night: null, total_price: null }
  const nights = nightsBetween(checkIn, checkOut)
  return { price_per_night: pricePerNight, total_price: pricePerNight * Math.max(nights, 0) }
}

export function createReservation(data: {
  property_id: number
  guest_name: string
  guest_rut: string
  guest_email?: string
  guest_phone?: string
  arrival_time?: string
  check_in: string
  check_out: string
  guests: number
  price_per_night?: number | null
  door_code?: string | null
  notes?: string
}): ReservationRow {
  const prop = getProperty(data.property_id)
  if (!prop) throw new Error('propiedad_no_encontrada')
  const price = data.price_per_night ?? prop.base_price_per_night ?? null
  const doorCode = data.door_code?.trim() || generateDoorCode()

  // Transacción: anti-solapamiento atómico
  const run = (): number => {
    db.exec('BEGIN IMMEDIATE')
    try {
      if (hasOverlap(data.property_id, data.check_in, data.check_out)) {
        throw new Error('fechas_no_disponibles')
      }
    const totals = computeTotals(price, data.check_in, data.check_out)
    const stmt = db.prepare(`
      INSERT INTO reservations (pnr, property_id, guest_name, guest_rut, guest_email, guest_phone, arrival_time, check_in, check_out, guests, price_per_night, total_price, door_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(
      generatePnr(),
      data.property_id,
      data.guest_name,
      data.guest_rut,
      data.guest_email ?? null,
      data.guest_phone ?? null,
      data.arrival_time ?? null,
      data.check_in,
      data.check_out,
      data.guests,
      totals.price_per_night,
      totals.total_price,
      doorCode,
      data.notes ?? null,
    )
      return Number(info.lastInsertRowid)
    } finally {
      db.exec('COMMIT')
    }
  }
  const newId = run()
  return getReservationById(newId)!
}

export function listReservations(): ReservationRow[] {
  return db
    .prepare('SELECT * FROM reservations ORDER BY check_in DESC')
    .all() as unknown as ReservationRow[]
}

export function getReservationById(id: number): ReservationRow | undefined {
  return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as unknown as ReservationRow | undefined
}

export function updateReservation(
  id: number,
  data: Partial<{
    property_id: number
    guest_name: string
    guest_rut: string
    guest_email: string | null
    guest_phone: string | null
    arrival_time: string | null
    check_in: string
    check_out: string
    guests: number
    price_per_night: number | null
    door_code: string | null
    status: string
    notes: string | null
  }>,
): ReservationRow | undefined {
  const current = getReservationById(id)
  if (!current) return undefined
  const next = { ...current, ...data, updated_at: new Date().toISOString() }
  const totals = computeTotals(next.price_per_night, next.check_in, next.check_out)
  next.price_per_night = totals.price_per_night
  next.total_price = totals.total_price

  const run = (): void => {
    db.exec('BEGIN IMMEDIATE')
    try {
      // Si cambian fechas/propiedad, revalidar solapamiento (excluyéndose a sí misma)
      if (
        next.property_id !== current.property_id ||
        next.check_in !== current.check_in ||
        next.check_out !== current.check_out
      ) {
        if (hasOverlap(next.property_id, next.check_in, next.check_out, id)) {
          throw new Error('fechas_no_disponibles')
        }
      }
    db.prepare(`
      UPDATE reservations SET
        property_id = ?, guest_name = ?, guest_rut = ?, guest_email = ?, guest_phone = ?,
        arrival_time = ?, check_in = ?, check_out = ?, guests = ?,
        price_per_night = ?, total_price = ?, door_code = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.property_id, next.guest_name, next.guest_rut, next.guest_email, next.guest_phone,
      next.arrival_time, next.check_in, next.check_out, next.guests,
      next.price_per_night, next.total_price, next.door_code, next.status, next.notes,
        next.updated_at, id,
      )
    } finally {
      db.exec('COMMIT')
    }
  }
  run()
  return getReservationById(id)
}

/** Actualización desde el portal del pasajero: solo sus datos de contacto/llegada. */
export function guestUpdateReservation(
  id: number,
  data: { guest_email?: string; guest_phone?: string; arrival_time?: string; notes?: string },
): ReservationRow | undefined {
  const current = getReservationById(id)
  if (!current) return undefined
  const next = { ...current, ...data, updated_at: new Date().toISOString() }
  db.prepare(`
    UPDATE reservations SET guest_email = ?, guest_phone = ?, arrival_time = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(next.guest_email, next.guest_phone, next.arrival_time, next.notes, next.updated_at, id)
  return getReservationById(id)
}

export function deleteReservation(id: number): boolean {
  const info = db.prepare('DELETE FROM reservations WHERE id = ?').run(id)
  return info.changes > 0
}

/** Validación del pasajero: PNR + nombre + RUT coinciden (case-insensitive en nombre). */
export function guestLookup(pnr: string, name: string, rut: string): ReservationRow | undefined {
  return db
    .prepare(
      `SELECT * FROM reservations
       WHERE UPPER(pnr) = ? AND LOWER(guest_name) = LOWER(?) AND guest_rut = ?`,
    )
    .get(pnr.toUpperCase(), name.trim(), rut.trim()) as unknown as ReservationRow | undefined
}

export interface Stats {
  month_income: number
  upcoming_checkins: number
  active_reservations: number
  occupancy_percent: number
  next_checkin: { pnr: string; guest_name: string; check_in: string; property_name: string } | null
}

export function getStats(propertyId?: number): Stats {
  const propFilter = propertyId ? 'AND property_id = ?' : ''
  const args: (string | number)[] = propertyId ? [propertyId] : []

  const now = new Date()
  const monthStart = now.toISOString().slice(0, 7) + '-01'
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

  const income = db
    .prepare(
      `SELECT COALESCE(SUM(total_price), 0) AS total FROM reservations
       WHERE status IN ('pendiente','confirmada')
         AND check_in >= ? AND check_in < ? ${propFilter}`,
    )
    .get(monthStart, nextMonth, ...args) as { total: number }

  const upcoming = db
    .prepare(
      `SELECT COUNT(*) AS n FROM reservations
       WHERE status IN ('pendiente','confirmada') AND check_in >= date('now') ${propFilter}`,
    )
    .get(...args) as { n: number }

  const active = db
    .prepare(
      `SELECT COUNT(*) AS n FROM reservations
       WHERE status IN ('pendiente','confirmada') AND check_out >= date('now') ${propFilter}`,
    )
    .get(...args) as { n: number }

  // Ocupación: noches reservadas / noches del mes x propiedades activas
  const nProps = (db.prepare('SELECT COUNT(*) AS n FROM properties WHERE active = 1').get() as { n: number }).n
  const reservedNights = db
    .prepare(
      `SELECT COALESCE(SUM(
         JULIANDAY(MAX(check_out, ?)) - JULIANDAY(MIN(check_in, ?))
       ), 0) AS n FROM reservations
       WHERE status IN ('pendiente','confirmada')
         AND check_in < ? AND check_out >= ? ${propFilter}`,
    )
    .get(monthStart, nextMonth, nextMonth, monthStart, ...args) as { n: number }
  const daysThisMonth = nightsBetween(monthStart, nextMonth)
  const capacity = daysThisMonth * Math.max(nProps, 1)
  const occupancy = capacity > 0 ? Math.round((reservedNights.n / capacity) * 100) : 0

  const nextCheckin = db
    .prepare(
      `SELECT r.pnr, r.guest_name, r.check_in, p.name AS property_name
       FROM reservations r JOIN properties p ON p.id = r.property_id
       WHERE r.status IN ('pendiente','confirmada') AND r.check_in >= date('now') ${propFilter}
       ORDER BY r.check_in ASC LIMIT 1`,
    )
    .get(...args) as Stats['next_checkin'] | undefined

  return {
    month_income: income.total,
    upcoming_checkins: upcoming.n,
    active_reservations: active.n,
    occupancy_percent: occupancy,
    next_checkin: nextCheckin ?? null,
  }
}

/** Calendario mensual por propiedad: días ocupados con PNR. */
export function getMonthCalendar(propertyId: number, year: number, month: number): {
  date: string
  status: 'libre' | 'parcial' | 'ocupado'
  pnr?: string
  guest_name?: string
}[] {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonthDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const rows = db
    .prepare(
      `SELECT pnr, guest_name, check_in, check_out FROM reservations
       WHERE property_id = ? AND status IN ('pendiente','confirmada')
         AND check_in < ? AND check_out > ?`,
    )
    .all(propertyId, nextMonthDate, monthStart) as unknown as {
    pnr: string
    guest_name: string
    check_in: string
    check_out: string
  }[]

  const daysInMonth = nightsBetween(monthStart, nextMonthDate)
  const result: { date: string; status: 'libre' | 'parcial' | 'ocupado'; pnr?: string; guest_name?: string }[] = []
  for (let d = 0; d < daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d + 1)).toISOString().slice(0, 10)
    const overlapping = rows.filter((r) => r.check_in <= date && r.check_out > date)
    // Noche "en curso": check_out cuenta como salida (el día de checkout está libre hasta 15:00)
    const bookedTonight = rows.some((r) => r.check_in <= date && r.check_out > date)
    const checkoutToday = rows.find((r) => r.check_out === date)
    const checkinToday = rows.find((r) => r.check_in === date)
    if (bookedTonight && !checkoutToday) {
      const first = overlapping[0]
      result.push({ date, status: 'ocupado', pnr: checkinToday?.pnr ?? first?.pnr, guest_name: first?.guest_name })
    } else if (checkinToday || checkoutToday) {
      const active = checkinToday ?? checkoutToday
      result.push({ date, status: 'parcial', pnr: checkinToday?.pnr ?? checkoutToday?.pnr, guest_name: checkinToday?.guest_name ?? checkoutToday?.guest_name })
    } else {
      result.push({ date, status: 'libre' })
    }
  }
  return result
}