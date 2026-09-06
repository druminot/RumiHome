import express from 'express'
import cors from 'cors'
import { adminRouter, guestRouter } from './routes/admin.js'
import { financeRouter } from './routes/finance.js'
import { smarthomeRouter, smarthomeIngestRouter } from './routes/smarthome.js'
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

// Ingest domótica (ESP32): autenticado por API key del dispositivo
app.use('/api/smarthome', smarthomeIngestRouter)

// CRM admin: protegido
app.use('/api', requireAdmin, adminRouter, financeRouter, smarthomeRouter)

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

app.listen(PORT, () => {
  console.log(`Rumihome API escuchando en :${PORT} (auth=${firebaseConfigured ? 'firebase' : process.env.ADMIN_PASSWORD ? 'dev-password' : 'none'})`)
})