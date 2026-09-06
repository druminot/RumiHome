import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { db } from './reservations.js'

/* ============ Esquema ============ */

db.exec(`
  CREATE TABLE IF NOT EXISTS smart_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL
      CHECK (type IN ('luz','llave','presencia','calefaccion','tv','energia')),
    room TEXT,
    api_key TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS smart_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES smart_devices(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL DEFAULT (datetime('now')),
    kwh REAL,
    minutes_on REAL,
    state TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_readings_device_time ON smart_readings(device_id, read_at);

  CREATE TABLE IF NOT EXISTS smart_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES smart_devices(id) ON DELETE CASCADE,
    event_at TEXT NOT NULL DEFAULT (datetime('now')),
    event_type TEXT NOT NULL,
    detail TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_device_time ON smart_events(device_id, event_at);
`)

/* ============ Tipos ============ */

export type SmartDeviceType = 'luz' | 'llave' | 'presencia' | 'calefaccion' | 'tv' | 'energia'

export interface SmartDeviceRow {
  id: number
  property_id: number
  name: string
  type: SmartDeviceType
  room: string | null
  api_key: string
  active: number
  last_seen: string | null
  created_at: string
}

export interface SmartReadingInput {
  kwh?: number
  minutes_on?: number
  state?: string
  /** ISO timestamp opcional (para batches offline). Debe ser pasado o futuro cercano. */
  read_at?: string
}

export interface SmartEventInput {
  event_type: string
  detail?: string
  /** ISO timestamp opcional (para batches offline). */
  event_at?: string
}

/** Valida timestamp ISO del ESP32 (YYYY-MM-DDTHH:MM o completo). */
function parseTs(raw: string | undefined): string | null {
  if (!raw) return null
  const t = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(t)) return null
  const iso = new Date(t).toISOString()
  // No aceptar más de 1 año atrás ni futuro lejano
  const now = Date.now()
  if (t < now - 365 * 86400000 || t > now + 86400000) return null
  return iso.slice(0, 19)
}

/* ============ Dispositivos (CRUD admin) ============ */

function generateApiKey(): string {
  return 'rk_' + randomBytes(24).toString('base64url')
}

export function createDevice(data: {
  property_id: number
  name: string
  type: SmartDeviceType
  room?: string
}): SmartDeviceRow {
  const info = db.prepare(`
    INSERT INTO smart_devices (property_id, name, type, room, api_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.property_id, data.name.trim(), data.type, data.room?.trim() || null, generateApiKey())
  return getDeviceById(Number(info.lastInsertRowid))!
}

export function getDeviceById(id: number): SmartDeviceRow | undefined {
  return db.prepare('SELECT * FROM smart_devices WHERE id = ?').get(id) as unknown as SmartDeviceRow | undefined
}

export function listDevices(): SmartDeviceRow[] {
  return db.prepare('SELECT * FROM smart_devices ORDER BY id').all() as unknown as SmartDeviceRow[]
}

export function deleteDevice(id: number): boolean {
  return db.prepare('DELETE FROM smart_devices WHERE id = ?').run(id).changes > 0
}

/** Rota la API key de un dispositivo (por seguridad). */
export function rotateApiKey(id: number): SmartDeviceRow | undefined {
  db.prepare('UPDATE smart_devices SET api_key = ? WHERE id = ?').run(generateApiKey(), id)
  return getDeviceById(id)
}

/* ============ Ingest (API pública con API key) ============ */

export function findDeviceByApiKey(apiKey: string): SmartDeviceRow | undefined {
  return db.prepare('SELECT * FROM smart_devices WHERE api_key = ? AND active = 1').get(apiKey) as unknown as SmartDeviceRow | undefined
}

export function ingestReading(deviceId: number, data: SmartReadingInput): void {
  const ts = parseTs(data.read_at)
  db.prepare(`
    INSERT INTO smart_readings (device_id, read_at, kwh, minutes_on, state)
    VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?)
  `).run(deviceId, ts, data.kwh ?? null, data.minutes_on ?? null, data.state ?? null)
  db.prepare("UPDATE smart_devices SET last_seen = datetime('now') WHERE id = ?").run(deviceId)
}

export function ingestEvent(deviceId: number, data: SmartEventInput): void {
  const ts = parseTs(data.event_at)
  db.prepare(`
    INSERT INTO smart_events (device_id, event_at, event_type, detail)
    VALUES (?, COALESCE(?, datetime('now')), ?, ?)
  `).run(deviceId, ts, data.event_type, data.detail?.trim() || null)
  db.prepare("UPDATE smart_devices SET last_seen = datetime('now') WHERE id = ?").run(deviceId)
}

/* ============ Analytics con atribución horaria ============ */
//
// Atribución: cada lectura cae dentro de una estadía [check_in 00:00, check_out 00:00)
// de una reserva confirmada/finalizada de la MISMA propiedad → uso del huésped.
// Fuera de toda estadía → uso del admin.

export interface SmarthomeSummary {
  devices: {
    id: number
    name: string
    type: SmartDeviceType
    room: string | null
    last_seen: string | null
  }[]
  energy_daily: { date: string; kwh_guest: number; kwh_admin: number }[]
  device_usage: { name: string; type: string; minutes_on: number; kwh: number }[]
  key_events: { event_at: string; event_type: string; detail: string | null; device: string }[]
  stays_usage: StayUsageListRow[]
  admin_usage: { kwh: number; days: number; avg_kwh_day: number | null }
  kwh_price: number
}

/** Filtro SQL: la lectura pertenece a un huésped de la propiedad dada. */
const GUEST_WINDOW = `
  EXISTS (
    SELECT 1 FROM reservations v
    WHERE v.status IN ('confirmada','finalizada')
      AND v.property_id = d.property_id
      AND r.read_at >= v.check_in || ' 00:00:00'
      AND r.read_at <  v.check_out || ' 00:00:00'
  )
`

/** kWh diario separado en fracción huésped / admin (últimos N días). */
export function getEnergyDailySplit(days = 7, propertyId?: number): { date: string; kwh_guest: number; kwh_admin: number }[] {
  const propFilter = propertyId ? 'AND d.property_id = ?' : ''
  const args = propertyId ? [propertyId] : []
  return db.prepare(`
    SELECT DATE(r.read_at) AS date,
      SUM(CASE WHEN ${GUEST_WINDOW} THEN r.kwh ELSE 0 END) AS kwh_guest,
      SUM(CASE WHEN ${GUEST_WINDOW} THEN 0 ELSE r.kwh END) AS kwh_admin
    FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
    WHERE d.type = 'energia' AND r.kwh IS NOT NULL
      AND r.read_at >= date('now', ?) ${propFilter}
    GROUP BY DATE(r.read_at) ORDER BY date
  `).all(`-${days} days`, ...args) as unknown as { date: string; kwh_guest: number; kwh_admin: number }[]
}

export interface StayUsageListRow {
  reservation_id: number
  pnr: string
  guest_name: string
  check_in: string
  check_out: string
  property_name: string
  kwh: number
  cost_clp: number
}

/** kWh por estadía: reserva cruzada con lecturas del medidor (huésped). */
export function getStaysUsageList(limit = 20, propertyId?: number): StayUsageListRow[] {
  const propFilter = propertyId ? 'AND v.property_id = ?' : ''
  const args = propertyId ? [propertyId] : []
  return db.prepare(`
    SELECT v.id AS reservation_id, v.pnr, v.guest_name, v.check_in, v.check_out,
      p.name AS property_name,
      COALESCE((
        SELECT SUM(r.kwh) FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
        WHERE d.type = 'energia' AND d.property_id = v.property_id
          AND r.kwh IS NOT NULL
          AND r.read_at >= v.check_in || ' 00:00:00'
          AND r.read_at <  v.check_out || ' 00:00:00'
      ), 0) AS kwh
    FROM reservations v JOIN properties p ON p.id = v.property_id
    WHERE v.status IN ('confirmada','finalizada') ${propFilter}
    ORDER BY v.check_in DESC LIMIT ?
  `).all(...args, limit) as unknown as StayUsageListRow[]
}

/** Uso del admin: lecturas fuera de toda estadía. */
export function getAdminUsage(days = 30, propertyId?: number): { kwh: number; days: number; avg_kwh_day: number | null } {
  const propFilter = propertyId ? 'AND d.property_id = ?' : ''
  const args = propertyId ? [propertyId] : []
  const row = db.prepare(`
    SELECT COALESCE(SUM(r.kwh), 0) AS kwh,
      COUNT(DISTINCT DATE(r.read_at)) AS days
    FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
    WHERE d.type = 'energia' AND r.kwh IS NOT NULL
      AND r.read_at >= date('now', ?) ${propFilter}
      AND NOT ${GUEST_WINDOW}
  `).get(`-${days} days`, ...args) as { kwh: number; days: number }
  return {
    kwh: row.kwh,
    days: row.days,
    avg_kwh_day: row.days > 0 ? row.kwh / row.days : null,
  }
}

export interface StayUsageDetail {
  reservation: { id: number; pnr: string; guest_name: string; check_in: string; check_out: string; property_name: string }
  kwh: number
  cost_clp: number
  hourly_profile: { hour: number; kwh: number }[]
  device_usage: { name: string; type: string; minutes_on: number; kwh: number }[]
  key_events: { event_at: string; event_type: string; detail: string | null; device: string }[]
}

/** Detalle completo de una estadía: energía, uso por dispositivo y llave. */
export function getStayUsageDetail(reservationId: number, kwhPrice: number): StayUsageDetail | null {
  const v = db.prepare(`
    SELECT v.id, v.pnr, v.guest_name, v.check_in, v.check_out, p.name AS property_name
    FROM reservations v JOIN properties p ON p.id = v.property_id
    WHERE v.id = ?
  `).get(reservationId) as
    | { id: number; pnr: string; guest_name: string; check_in: string; check_out: string; property_name: string }
    | undefined
  if (!v) return null

  const inStay = (table: string, tsCol: string) => `
    SELECT * FROM ${table} t JOIN smart_devices d ON d.id = t.device_id
    WHERE d.property_id = (SELECT property_id FROM reservations WHERE id = ?)
      AND t.${tsCol} >= (SELECT check_in FROM reservations WHERE id = ?) || ' 00:00:00'
      AND t.${tsCol} <  (SELECT check_out FROM reservations WHERE id = ?) || ' 00:00:00'
  `

  const kwh = (db.prepare(`
    SELECT COALESCE(SUM(r.kwh), 0) AS kwh FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
    WHERE d.type = 'energia' AND r.kwh IS NOT NULL
      AND r.read_at >= ? AND r.read_at < ?
  `).get(v.check_in + ' 00:00:00', v.check_out + ' 00:00:00') as { kwh: number }).kwh

  const hourly = db.prepare(`
    SELECT CAST(strftime('%H', r.read_at) AS INTEGER) AS hour, SUM(r.kwh) AS kwh
    FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
    WHERE d.type = 'energia' AND r.kwh IS NOT NULL
      AND d.property_id = (SELECT property_id FROM reservations WHERE id = ?)
      AND r.read_at >= ? AND r.read_at < ?
    GROUP BY hour ORDER BY hour
  `).all(reservationId, v.check_in + ' 00:00:00', v.check_out + ' 00:00:00') as unknown as { hour: number; kwh: number }[]

  const deviceUsage = db.prepare(`
    SELECT d.name, d.type, COALESCE(SUM(r.minutes_on), 0) AS minutes_on, COALESCE(SUM(r.kwh), 0) AS kwh
    FROM smart_devices d
    LEFT JOIN smart_readings r ON r.device_id = d.id
      AND r.read_at >= ? AND r.read_at < ?
    WHERE d.property_id = (SELECT property_id FROM reservations WHERE id = ?) AND d.active = 1
    GROUP BY d.id ORDER BY minutes_on DESC
  `).all(v.check_in + ' 00:00:00', v.check_out + ' 00:00:00', reservationId) as unknown as { name: string; type: string; minutes_on: number; kwh: number }[]

  const keyEvents = db.prepare(`
    SELECT e.event_at, e.event_type, e.detail, d.name AS device
    FROM smart_events e JOIN smart_devices d ON d.id = e.device_id
    WHERE d.type = 'llave'
      AND d.property_id = (SELECT property_id FROM reservations WHERE id = ?)
      AND e.event_at >= ? AND e.event_at < ?
    ORDER BY e.event_at DESC LIMIT 50
  `).all(reservationId, v.check_in + ' 00:00:00', v.check_out + ' 00:00:00') as unknown as { event_at: string; event_type: string; detail: string | null; device: string }[]

  return {
    reservation: v,
    kwh,
    cost_clp: Math.round(kwh * kwhPrice),
    hourly_profile: hourly,
    device_usage: deviceUsage,
    key_events: keyEvents,
  }
}

/** Precio kWh en CLP (env KWH_PRICE_CLP, default 160). */
export function getKwhPrice(): number {
  const p = Number(process.env.KWH_PRICE_CLP)
  return Number.isFinite(p) && p > 0 ? p : 160
}

/** Estado actual por dispositivo: último state reportado (ej. luz on/off). */
export function getDeviceStates(): Map<number, string | null> {
  const rows = db.prepare(`
    SELECT d.id,
      (SELECT r.state FROM smart_readings r
       WHERE r.device_id = d.id AND r.state IS NOT NULL
       ORDER BY r.read_at DESC LIMIT 1) AS state
    FROM smart_devices d WHERE d.active = 1
  `).all() as unknown as { id: number; state: string | null }[]
  return new Map(rows.map((r) => [r.id, r.state]))
}

/** Uso por dispositivo: minutos encendido y kWh acumulado (últimos N días). */
export function getDeviceUsage(days = 7): { name: string; type: string; minutes_on: number; kwh: number }[] {
  return db.prepare(`
    SELECT d.name, d.type, COALESCE(SUM(r.minutes_on), 0) AS minutes_on, COALESCE(SUM(r.kwh), 0) AS kwh
    FROM smart_devices d LEFT JOIN smart_readings r ON r.device_id = d.id
      AND r.read_at >= date('now', ?)
    WHERE d.active = 1 GROUP BY d.id ORDER BY minutes_on DESC
  `).all(`-${days} days`) as unknown as { name: string; type: string; minutes_on: number; kwh: number }[]
}

/** Últimos eventos de llave electrónica. */
export function getKeyEvents(limit = 20): { event_at: string; event_type: string; detail: string | null; device: string }[] {
  return db.prepare(`
    SELECT e.event_at, e.event_type, e.detail, d.name AS device
    FROM smart_events e JOIN smart_devices d ON d.id = e.device_id
    WHERE d.type = 'llave' ORDER BY e.event_at DESC LIMIT ?
  `).all(limit) as unknown as { event_at: string; event_type: string; detail: string | null; device: string }[]
}