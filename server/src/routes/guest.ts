import { Router, type Request, type Response } from 'express'
import { guestLookup } from '../db/reservations.js'

export const guestRouter = Router()

/**
 * Rutas públicas del portal del pasajero.
 * El "secreto" es la combinación PNR + nombre + RUT: suficiente para
 * consultar (no modificar) una reserva individual.
 */

async function lookup(req: Request, res: Response) {
  const { pnr, name, rut } = req.body ?? {}
  if (!pnr?.trim() || !name?.trim() || !rut?.trim()) {
    return res.status(400).json({ error: 'PNR, nombre y RUT son obligatorios' })
  }
  const reservation = guestLookup(String(pnr), String(name), String(rut))
  if (!reservation) {
    // 404 genérico: no revelar si el PNR existe
    return res.status(404).json({ error: 'Reserva no encontrada con esos datos' })
  }
  return res.json(reservation)
}

/** POST /api/guest/lookup — buscar reserva (desde formulario de login). */
guestRouter.post('/lookup', lookup)

/** POST /api/guest/reservation — re-obtener reserva autenticada por los 3 datos. */
guestRouter.post('/reservation', lookup)