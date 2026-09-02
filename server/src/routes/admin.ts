import { Router, type Request, type Response } from 'express'
import {
  createReservation,
  listReservations,
  getReservationById,
  updateReservation,
  deleteReservation,
  guestLookup,
} from '../db/reservations.js'

export const adminRouter = Router()

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
    const guestsNum = Number(guests)
    if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > 8) {
      return res.status(400).json({ error: 'Huéspedes debe ser un entero entre 1 y 8' })
    }
    const created = createReservation({
      guest_name: String(guest_name).trim(),
      guest_rut: String(guest_rut).trim(),
      guest_email: req.body.guest_email?.trim() || undefined,
      guest_phone: req.body.guest_phone?.trim() || undefined,
      check_in: String(check_in),
      check_out: String(check_out),
      guests: guestsNum,
      notes: req.body.notes?.trim() || undefined,
    })
    res.status(201).json(created)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno al crear la reserva' })
  }
})

/** GET /api/reservations — listar todas (admin). */
adminRouter.get('/reservations', (_req, res) => {
  res.json(listReservations())
})

/** PATCH /api/reservations/:id — actualizar (admin). */
adminRouter.patch('/reservations/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  const existing = getReservationById(id)
  if (!existing) return res.status(404).json({ error: 'Reserva no encontrada' })

  const b = req.body ?? {}
  if (b.check_in && b.check_out && b.check_out <= b.check_in) {
    return res.status(400).json({ error: 'El check-out debe ser posterior al check-in' })
  }
  if (!b.check_in && b.check_out && existing.check_out <= b.check_out && b.check_out <= existing.check_in) {
    // check-out antes del check-in existente
  }
  const merged = { ...existing, ...b }
  if (merged.check_out <= merged.check_in) {
    return res.status(400).json({ error: 'El check-out debe ser posterior al check-in' })
  }
  if (b.guests !== undefined) {
    const g = Number(b.guests)
    if (!Number.isInteger(g) || g < 1 || g > 8) {
      return res.status(400).json({ error: 'Huéspedes debe ser un entero entre 1 y 8' })
    }
    b.guests = g
  }
  const updated = updateReservation(id, b)
  res.json(updated)
})

/** DELETE /api/reservations/:id — eliminar (admin). */
adminRouter.delete('/reservations/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  if (!deleteReservation(id)) return res.status(404).json({ error: 'Reserva no encontrada' })
  res.status(204).end()
})