import express from 'express'
import cors from 'cors'
import { adminRouter } from './routes/admin.js'
import { guestRouter } from './routes/guest.js'
import { requireAdmin } from './middleware/auth.js'
import { firebaseConfigured } from './firebase-admin.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors())
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, auth: firebaseConfigured ? 'firebase' : process.env.ADMIN_PASSWORD ? 'dev-password' : 'none' })
})

// Portal pasajero: público
app.use('/api/guest', guestRouter)

// CRM admin: protegido
app.use('/api', requireAdmin, adminRouter)

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

app.listen(PORT, () => {
  console.log(`Rumihome API escuchando en :${PORT} (auth=${firebaseConfigured ? 'firebase' : process.env.ADMIN_PASSWORD ? 'dev-password' : 'none'})`)
})