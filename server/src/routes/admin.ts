import { Router, type Request, type Response } from 'express'
import {
  createReservation,
  listReservations,
  getReservationById,
  updateReservation,
  deleteReservation,
  guestLookup,
  guestUpdateReservation,
  listProperties,
  getProperty,
  getStats,
  getMonthCalendar,
  hasOverlap,
} from '../db/reservations.js'

export const adminRouter = Router()

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** POST /api/reservations — crear reserva (admin). */
adminRouter.post('/reservations', async (req: Request, res: Response) => {
  try {
    const { guest_name, guest_rut, check_in, check_out, guests } = req.body ?? {}
    if (!guest_name?.trim() || !guest_rut?.trim()) {
      return res.status(400).json({ error: 'Nombre y RUT del pasajero son obligatorios' })
    }
    if (!check_in || !check_out) {
      return res.status(400).json({ error: 'Check-in y check-out son obligatorios' })
    }
    if (check_out <= check_in) {
      return res.status(400).json({ error: 'El check-out debe ser posterior al check-in' })
    }
    const propertyId = Number(req.body.property_id)
    const prop = getProperty(propertyId)
    if (!prop) return res.status(400).json({ error: 'Propiedad no encontrada' })
    const guestsNum = Number(guests)
    if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > prop.max_guests) {
      return res.status(400).json({ error: `Huéspedes debe ser entre 1 y ${prop.max_guests}` })
    }
    const price = req.body.price_per_night == null || req.body.price_per_night === ''
      ? undefined
      : Number(req.body.price_per_night)
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      return res.status(400).json({ error: 'Precio inválido' })
    }
    if (req.body.door_code != null && req.body.door_code !== '' && !/^\d{8}$/.test(String(req.body.door_code).trim())) {
      return res.status(400).json({ error: 'La clave de puerta debe ser 8 dígitos' })
    }
    try {
      const created = createReservation({
        property_id: propertyId,
        guest_name: String(guest_name).trim(),
        guest_rut: String(guest_rut).trim(),
        guest_email: req.body.guest_email?.trim() || undefined,
        guest_phone: req.body.guest_phone?.trim() || undefined,
        arrival_time: req.body.arrival_time?.trim() || undefined,
        check_in: String(check_in),
        check_out: String(check_out),
        guests: guestsNum,
        price_per_night: price,
        door_code: req.body.door_code?.trim() || undefined,
        notes: req.body.notes?.trim() || undefined,
      })
      res.status(201).json(created)
    } catch (err) {
      if (err instanceof Error && err.message === 'fechas_no_disponibles') {
        return res.status(409).json({ error: 'Las fechas se solapan con otra reserva activa' })
      }
      throw err
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno al crear la reserva' })
  }
})

/** GET /api/reservations — listar todas (admin). */
adminRouter.get('/reservations', (_req, res) => {
  res.json(listReservations())
})

/** GET /api/stats — métricas del dashboard (admin). */
adminRouter.get('/stats', (req, res) => {
  const propertyId = req.query.property_id ? Number(req.query.property_id) : undefined
  res.json(getStats(propertyId))
})

/** GET /api/properties — listar propiedades (admin + se usa en el form). */
adminRouter.get('/properties', (_req, res) => {
  res.json(listProperties())
})

/** GET /api/calendar/:propertyId/:year/:month — ocupación mensual (admin). */
adminRouter.get('/calendar/:propertyId/:year/:month', (req, res) => {
  const propertyId = Number(req.params.propertyId)
  const year = Number(req.params.year)
  const month = Number(req.params.month)
  if (!Number.isInteger(propertyId) || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Parámetros inválidos' })
  }
  res.json({ property_id: propertyId, year, month, days: getMonthCalendar(propertyId, year, month) })
})

/** PATCH /api/reservations/:id — actualizar (admin). */
adminRouter.patch('/reservations/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  const existing = getReservationById(id)
  if (!existing) return res.status(404).json({ error: 'Reserva no encontrada' })

  const b = { ...req.body }
  delete b.pnr
  delete b.total_price
  delete b.created_at
  if (b.status && !['pendiente', 'confirmada', 'cancelada', 'finalizada'].includes(b.status)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }
  if (b.door_code !== undefined && b.door_code !== null && !/^\d{8}$/.test(String(b.door_code).trim())) {
    return res.status(400).json({ error: 'La clave de puerta debe ser 8 dígitos' })
  }
  if (b.guests !== undefined) {
    const g = Number(b.guests)
    const prop = getProperty(Number(b.property_id ?? existing.property_id))
    if (!Number.isInteger(g) || g < 1 || (prop && g > prop.max_guests)) {
      return res.status(400).json({ error: 'Huéspedes inválido' })
    }
    b.guests = g
  }
  const merged = { ...existing, ...b }
  if (merged.check_out <= merged.check_in) {
    return res.status(400).json({ error: 'El check-out debe ser posterior al check-in' })
  }
  try {
    const updated = updateReservation(id, b)
    res.json(updated)
  } catch (err) {
    if (err instanceof Error && err.message === 'fechas_no_disponibles') {
      return res.status(409).json({ error: 'Las fechas se solapan con otra reserva activa' })
    }
    throw err
  }
})

/** DELETE /api/reservations/:id — eliminar (admin). */
adminRouter.delete('/reservations/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  if (!deleteReservation(id)) return res.status(404).json({ error: 'Reserva no encontrada' })
  res.status(204).end()
})

/* ============ Portal pasajero ============ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function guestView(r: NonNullable<ReturnType<typeof getReservationById>>) {
  return {
    pnr: r.pnr,
    property_name: getProperty(r.property_id)?.name ?? '',
    guest_name: r.guest_name,
    guest_rut: r.guest_rut,
    check_in: r.check_in,
    check_out: r.check_out,
    guests: r.guests,
    nights: Math.max(0, Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / 86400000)),
    price_per_night: r.price_per_night,
    total_price: r.total_price,
    // Clave de puerta solo si la reserva está confirmada
    door_code: r.status === 'confirmada' ? r.door_code : null,
    status: r.status,
    notes: r.notes,
    guest_email: r.guest_email,
    guest_phone: r.guest_phone,
    arrival_time: r.arrival_time,
  }
}

/** POST /api/guest/lookup — buscar reserva (desde formulario de login). */
export const guestRouter = Router()

guestRouter.post('/lookup', (req: Request, res: Response) => {
  const { pnr, rut } = req.body ?? {}
  if (!pnr?.trim() || !rut?.trim()) {
    return res.status(400).json({ error: 'PNR y RUT son obligatorios' })
  }
  const reservation = guestLookup(String(pnr), String(rut))
  if (!reservation) {
    // 404 genérico: no revelar si el PNR existe
    return res.status(404).json({ error: 'Reserva no encontrada con esos datos' })
  }
  return res.json(guestView(reservation))
})

/** POST /api/guest/reservation — re-obtener reserva autenticada por los 3 datos. */
guestRouter.post('/reservation', (req: Request, res: Response) => {
  const { pnr, rut } = req.body ?? {}
  if (!pnr?.trim() || !rut?.trim()) {
    return res.status(400).json({ error: 'PNR y RUT son obligatorios' })
  }
  const reservation = guestLookup(String(pnr), String(rut))
  if (!reservation) {
    return res.status(404).json({ error: 'Reserva no encontrada con esos datos' })
  }
  return res.json(guestView(reservation))
})

/** PATCH /api/guest/reservation — check-in online: el pasajero completa sus datos. */
guestRouter.patch('/reservation', (req: Request, res: Response) => {
  const { pnr, rut, guest_email, guest_phone, arrival_time } = req.body ?? {}
  if (!pnr?.trim() || !rut?.trim()) {
    return res.status(400).json({ error: 'PNR y RUT son obligatorios' })
  }
  const reservation = guestLookup(String(pnr), String(rut))
  if (!reservation) {
    return res.status(404).json({ error: 'Reserva no encontrada con esos datos' })
  }
  if (reservation.status === 'cancelada') {
    return res.status(400).json({ error: 'Esta reserva está cancelada' })
  }
  if (guest_email && !EMAIL_RE.test(String(guest_email).trim())) {
    return res.status(400).json({ error: 'Correo inválido' })
  }
  const updated = guestUpdateReservation(reservation.id, {
    guest_email: guest_email?.trim() || undefined,
    guest_phone: guest_phone?.trim() || undefined,
    arrival_time: arrival_time?.trim() || undefined,
  })
  return res.json(guestView(updated!))
})

