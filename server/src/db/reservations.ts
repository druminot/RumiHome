import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface ReservationRow {
  id: number
  pnr: string
  guest_name: string
  guest_rut: string
  guest_email: string | null
  guest_phone: string | null
  check_in: string
  check_out: string
  guests: number
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

const DB_PATH = process.env.DB_PATH ?? '/data/rumihome.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pnr TEXT NOT NULL UNIQUE,
    guest_name TEXT NOT NULL,
    guest_rut TEXT NOT NULL,
    guest_email TEXT,
    guest_phone TEXT,
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (status IN ('pendiente','confirmada','cancelada','finalizada')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reservations_rut ON reservations(guest_rut);
  CREATE INDEX IF NOT EXISTS idx_reservations_pnr ON reservations(pnr);
`)

/** Genera un PNR legible tipo RUMI-XXXXXX (sin caracteres ambiguos). */
export function generatePnr(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let code = ''
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return `RUMI-${code}`
}

export function createReservation(data: {
  guest_name: string
  guest_rut: string
  guest_email?: string
  guest_phone?: string
  check_in: string
  check_out: string
  guests: number
  notes?: string
}): ReservationRow {
  const stmt = db.prepare(`
    INSERT INTO reservations (pnr, guest_name, guest_rut, guest_email, guest_phone, check_in, check_out, guests, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    generatePnr(),
    data.guest_name,
    data.guest_rut,
    data.guest_email ?? null,
    data.guest_phone ?? null,
    data.check_in,
    data.check_out,
    data.guests,
    data.notes ?? null,
  )
  return getReservationById(Number(info.lastInsertRowid))!
}

export function listReservations(): ReservationRow[] {
  return db.prepare('SELECT * FROM reservations ORDER BY check_in DESC').all() as unknown as ReservationRow[]
}

export function getReservationById(id: number): ReservationRow | undefined {
  return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as unknown as ReservationRow | undefined
}

export function updateReservation(
  id: number,
  data: Partial<{
    guest_name: string
    guest_rut: string
    guest_email: string | null
    guest_phone: string | null
    check_in: string
    check_out: string
    guests: number
    status: string
    notes: string | null
  }>,
): ReservationRow | undefined {
  const current = getReservationById(id)
  if (!current) return undefined
  const next = { ...current, ...data, updated_at: new Date().toISOString() }
  db.prepare(`
    UPDATE reservations SET
      guest_name = ?, guest_rut = ?, guest_email = ?, guest_phone = ?,
      check_in = ?, check_out = ?, guests = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.guest_name, next.guest_rut, next.guest_email, next.guest_phone,
    next.check_in, next.check_out, next.guests, next.status, next.notes,
    next.updated_at, id,
  )
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