import type { NextFunction, Request, Response } from 'express'
import { verifyIdToken } from '../firebase-admin.js'

/**
 * Middleware de autenticación admin.
 *
 * - Si FIREBASE_PROJECT_ID está definido: valida el token JWT de Firebase.
 * - Si no (desarrollo): exige ADMIN_PASSWORD en el header x-admin-password,
 *   o si no hay ADMIN_PASSWORD definida, rechaza con 503.
 *
 * Las rutas /api/guest/* son públicas por diseño (el factor de autenticación
 * es la combinación PNR + nombre + RUT).
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID

  if (projectId) {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    try {
      const decoded = await verifyIdToken(header.slice(7))
      ;(req as AdminRequest).adminEmail = decoded.email
      next()
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado' })
    }
    return
  }

  // Modo desarrollo con password compartida
  const devPassword = process.env.ADMIN_PASSWORD
  if (!devPassword) {
    res.status(503).json({
      error: 'Servidor sin autenticación configurada. Define FIREBASE_PROJECT_ID o ADMIN_PASSWORD.',
    })
    return
  }
  if (req.headers['x-admin-password'] !== devPassword) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  ;(req as AdminRequest).adminEmail = 'dev-admin'
  next()
}

export interface AdminRequest extends Request {
  adminEmail?: string
}