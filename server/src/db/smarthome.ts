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
}

export interface SmartEventInput {
  event_type: string
  detail?: string
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
  db.prepare('INSERT INTO smart_readings (device_id, kwh, minutes_on, state) VALUES (?, ?, ?, ?)')
    .run(deviceId, data.kwh ?? null, data.minutes_on ?? null, data.state ?? null)
  db.prepare("UPDATE smart_devices SET last_seen = datetime('now') WHERE id = ?").run(deviceId)
}

export function ingestEvent(deviceId: number, data: SmartEventInput): void {
  db.prepare('INSERT INTO smart_events (device_id, event_type, detail) VALUES (?, ?, ?)')
    .run(deviceId, data.event_type, data.detail?.trim() || null)
  db.prepare("UPDATE smart_devices SET last_seen = datetime('now') WHERE id = ?").run(deviceId)
}

/* ============ Analytics ============ */

export interface SmarthomeSummary {
  devices: {
    id: number
    name: string
    type: SmartDeviceType
    room: string | null
    last_seen: string | null
  }[]
  energy_today: { date: string; kwh: number }[]
  device_usage: { name: string; type: string; minutes_on: number; kwh: number }[]
  key_events: { event_at: string; event_type: string; detail: string | null; device: string }[]
  guest_vs_empty: { avg_kwh_with_guest: number | null; avg_kwh_empty: number | null }
}

/** kWh diario del medidor de energía (últimos N días). */
export function getEnergyDaily(days = 7, propertyId?: number): { date: string; kwh: number }[] {
  const propFilter = propertyId ? 'AND d.property_id = ?' : ''
  const args = propertyId ? [propertyId] : []
  const rows = db.prepare(`
    SELECT DATE(r.read_at) AS date, SUM(r.kwh) AS kwh
    FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
    WHERE d.type = 'energia' AND r.read_at >= date('now', ?) ${propFilter}
    GROUP BY DATE(r.read_at) ORDER BY date
  `).all(`-${days} days`, ...args) as unknown as { date: string; kwh: number }[]
  return rows
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

/** Consumo promedio diario: noches con huésped vs noches vacías. */
export function getGuestVsEmpty(): { avg_kwh_with_guest: number | null; avg_kwh_empty: number | null } {
  // kWh por día + flag: ¿había huésped esa noche? (check_in <= día < check_out)
  const rows = db.prepare(`
    SELECT days.date, days.kwh,
      EXISTS (
        SELECT 1 FROM reservations v
        WHERE v.status IN ('pendiente','confirmada','finalizada')
          AND v.check_in <= days.date AND v.check_out > days.date
      ) AS has_guest
    FROM (
      SELECT DATE(r.read_at) AS date, SUM(r.kwh) AS kwh
      FROM smart_readings r JOIN smart_devices d ON d.id = r.device_id
      WHERE d.type = 'energia' AND r.kwh IS NOT NULL
      GROUP BY DATE(r.read_at)
    ) days
  `).all() as unknown as { date: string; kwh: number; has_guest: number }[]

  const guest = rows.filter((r) => r.has_guest === 1)
  const empty = rows.filter((r) => r.has_guest === 0)
  const avg = (arr: typeof rows): number | null =>
    arr.length ? arr.reduce((s, r) => s + r.kwh, 0) / arr.length : null

  return {
    avg_kwh_with_guest: avg(guest),
    avg_kwh_empty: avg(empty),
  }
}