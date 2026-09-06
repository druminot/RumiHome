import { Router, type Request, type Response } from 'express'
import {
  createDevice, listDevices, deleteDevice, rotateApiKey,
  ingestReading, ingestEvent, findDeviceByApiKey,
  getEnergyDailySplit, getDeviceUsage, getKeyEvents,
  getStaysUsageList, getAdminUsage, getStayUsageDetail, getKwhPrice, getDeviceStates,
  type SmartDeviceType,
} from '../db/smarthome.js'

/** CRUD de dispositivos: protegido con token admin (montado en /api). */
export const smarthomeRouter = Router()

/** Ingest pública: autenticada por API key del dispositivo. */
export const smarthomeIngestRouter = Router()

const DEVICE_TYPES: SmartDeviceType[] = ['luz', 'llave', 'presencia', 'calefaccion', 'tv', 'energia']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* ============ Admin: dispositivos ============ */

/** POST /api/smarthome/devices */
smarthomeRouter.post('/smarthome/devices', (req: Request, res: Response) => {
  const { property_id, name, type, room } = req.body ?? {}
  if (!property_id || !name?.trim() || !type) {
    return res.status(400).json({ error: 'Propiedad, nombre y tipo son obligatorios' })
  }
  if (!DEVICE_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' })
  }
  res.status(201).json(createDevice({ property_id: Number(property_id), name: String(name), type, room }))
})

/** GET /api/smarthome/devices */
smarthomeRouter.get('/smarthome/devices', (_req, res) => {
  res.json(listDevices())
})

/** DELETE /api/smarthome/devices/:id */
smarthomeRouter.delete('/smarthome/devices/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  if (!deleteDevice(id)) return res.status(404).json({ error: 'Dispositivo no encontrado' })
  res.status(204).end()
})

/** POST /api/smarthome/devices/:id/rotate — regenerar API key. */
smarthomeRouter.post('/smarthome/devices/:id/rotate', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  const dev = rotateApiKey(id)
  if (!dev) return res.status(404).json({ error: 'Dispositivo no encontrado' })
  res.json(dev)
})

/* ============ Admin: analytics ============ */

/** GET /api/smarthome/summary?days&property_id — panel domótica. */
smarthomeRouter.get('/smarthome/summary', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 30)
  const propertyId = req.query.property_id ? Number(req.query.property_id) : undefined
  const kwhPrice = getKwhPrice()
  const stays = getStaysUsageList(20, propertyId)
  const states = getDeviceStates()
  res.json({
    devices: listDevices().map((d) => ({
      id: d.id, name: d.name, type: d.type, room: d.room, last_seen: d.last_seen,
      state: states.get(d.id) ?? null,
    })),
    energy_daily: getEnergyDailySplit(days, propertyId),
    device_usage: getDeviceUsage(days),
    key_events: getKeyEvents(20),
    stays_usage: stays.map((s) => ({ ...s, cost_clp: Math.round(s.kwh * kwhPrice) })),
    admin_usage: getAdminUsage(days, propertyId),
    kwh_price: kwhPrice,
  })
})

/** GET /api/smarthome/stay/:reservationId — detalle de consumo de una estadía. */
smarthomeRouter.get('/smarthome/stay/:reservationId', (req, res) => {
  const id = Number(req.params.reservationId)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  const detail = getStayUsageDetail(id, getKwhPrice())
  if (!detail) return res.status(404).json({ error: 'Reserva no encontrada' })
  res.json(detail)
})

/* ============ Ingest público (ESP32) ============ */

/** POST /api/smarthome/ingest — header x-api-key o ?api_key= */
smarthomeIngestRouter.post('/ingest', (req: Request, res: Response) => {
  const apiKey = req.get('x-api-key') ?? (req.query.api_key as string | undefined)
  if (!apiKey) return res.status(401).json({ error: 'API key requerida (header x-api-key)' })
  const device = findDeviceByApiKey(apiKey)
  if (!device) return res.status(401).json({ error: 'API key inválida' })

  const { readings, events } = req.body ?? {}

  if (Array.isArray(readings) && readings.length > 0) {
    for (const r of readings) {
      const kwh = r?.kwh != null ? Number(r.kwh) : undefined
      const min = r?.minutes_on != null ? Number(r.minutes_on) : undefined
      if (kwh != null && (!Number.isFinite(kwh) || kwh < 0)) {
        return res.status(400).json({ error: 'kwh inválido' })
      }
      if (min != null && (!Number.isFinite(min) || min < 0)) {
        return res.status(400).json({ error: 'minutes_on inválido' })
      }
      if (r?.read_at != null && typeof r.read_at !== 'string') {
        return res.status(400).json({ error: 'read_at debe ser un timestamp ISO' })
      }
      ingestReading(device.id, {
        kwh: kwh ?? undefined,
        minutes_on: min ?? undefined,
        state: r?.state != null ? String(r.state).slice(0, 32) : undefined,
        read_at: r?.read_at,
      })
    }
  }

  if (Array.isArray(events) && events.length > 0) {
    for (const e of events) {
      if (!e?.event_type?.trim()) {
        return res.status(400).json({ error: 'event_type es obligatorio en events' })
      }
      if (e?.event_at != null && typeof e.event_at !== 'string') {
        return res.status(400).json({ error: 'event_at debe ser un timestamp ISO' })
      }
      ingestEvent(device.id, {
        event_type: String(e.event_type).slice(0, 32),
        detail: e.detail != null ? String(e.detail).slice(0, 200) : undefined,
        event_at: e?.event_at,
      })
    }
  }

  if (!Array.isArray(readings) && !Array.isArray(events)) {
    return res.status(400).json({ error: 'Body debe incluir readings[] y/o events[]' })
  }

  res.json({ ok: true, device: device.name, received: { readings: Array.isArray(readings) ? readings.length : 0, events: Array.isArray(events) ? events.length : 0 } })
})

/** GET /api/smarthome/ingest — health check para ESP32. */
smarthomeIngestRouter.get('/ingest', (req, res) => {
  const apiKey = req.get('x-api-key') ?? (req.query.api_key as string | undefined)
  if (!apiKey) return res.status(401).json({ error: 'API key requerida' })
  const device = findDeviceByApiKey(apiKey)
  if (!device) return res.status(401).json({ error: 'API key inválida' })
  res.json({ ok: true, device: device.name, server_time: new Date().toISOString() })
})