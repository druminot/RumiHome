import { Router, type Request, type Response } from 'express'
import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

interface AdminRequest extends Request {
  adminEmail?: string
}

/**
 * deployments.ts — endpoints del panel /code (árbol de versiones + promote/rollback).
 *
 * La data vive en /deploy-data (volumen compartido con el deploy-bridge del host):
 *   history.json   ← regenerado cada 1 min por infra/deploy-bridge/history.py
 *   queue/*.json   ← este router ESCRIBE peticiones; el executor las procesa
 *   results/*.json ← este router LEE resultados (polling del frontend)
 *
 * Seguridad: todo tras requireAdmin (Firebase). Las acciones exigen además un
 * nonce de un solo uso (GET /nonce, TTL 5 min, máx 3 activos). El POST NUNCA
 * ejecuta nada: solo encola; el executor del host valida y corre promote.sh /
 * rollback.sh con sus guards (healthcheck, auto-rollback, backup DB).
 */

export const deploymentsRouter = Router()

const DEPLOY_DIR = process.env.DEPLOY_DATA_DIR ?? '/deploy-data'
const QUEUE_DIR = path.join(DEPLOY_DIR, 'queue')
const RESULTS_DIR = path.join(DEPLOY_DIR, 'results')
const HISTORY_FILE = path.join(DEPLOY_DIR, 'history.json')

const NONCE_TTL_MS = 5 * 60 * 1000
const MAX_NONCES = 3
// Tags reales de prod: prod-YYYY-MM-DD-HHMM, prod-YYYY-MM-DD-base, prod-pre-*,
// etc. Se acepta cualquier tag prod-* razonable; el executor + git validan de nuevo.
const TAG_RE = /^prod-[a-z0-9][a-z0-9-]*$/
const BRANCH_RE = /^rr-feature-[a-z0-9-]+$/

interface Nonce {
  value: string
  email: string
  expiresAt: number
}

const nonces = new Map<string, Nonce>()

function pruneNonces() {
  const now = Date.now()
  for (const [k, n] of nonces) {
    if (n.expiresAt < now) nonces.delete(k)
  }
}

/** GET /api/deployments/history — árbol de versiones (lee history.json). */
deploymentsRouter.get('/deployments/history', async (_req: Request, res: Response) => {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8')
    res.type('json').send(raw)
  } catch {
    res.status(503).json({
      error: 'history.json no disponible aún — el deploy-bridge lo genera cada minuto. Reintenta en 60s.',
    })
  }
})

/** GET /api/deployments/nonce — token de un solo uso para acciones. */
deploymentsRouter.get('/deployments/nonce', (req: Request, res: Response) => {
  pruneNonces()
  const email = (req as AdminRequest).adminEmail ?? 'admin'
  const mine = [...nonces.values()].filter((n) => n.email === email)
  if (mine.length >= MAX_NONCES) {
    return res.status(429).json({ error: 'Demasiados nonces activos. Espera 5 min.' })
  }
  const value = randomBytes(32).toString('hex')
  nonces.set(value, { value, email, expiresAt: Date.now() + NONCE_TTL_MS })
  res.json({ nonce: value, ttl_seconds: NONCE_TTL_MS / 1000 })
})

function consumeNonce(nonce: string, email: string): string | null {
  pruneNonces()
  const n = nonces.get(nonce)
  if (!n) return 'Nonce inválido o ya usado'
  if (n.expiresAt < Date.now()) {
    nonces.delete(nonce)
    return 'Nonce expirado (TTL 5 min)'
  }
  if (n.email !== email) return 'Nonce emitido a otro admin'
  nonces.delete(nonce)
  return null
}

async function enqueue(req: Request, res: Response, action: 'promote' | 'rollback' | 'reject') {
  const email = (req as AdminRequest).adminEmail ?? 'dev-admin'
  const err = consumeNonce(String(req.body?.nonce ?? ''), email)
  if (err) return res.status(403).json({ error: err })

  const body: Record<string, unknown> = {
    action,
    requested_by: email,
    requested_at: new Date().toISOString(),
  }
  if (action === 'rollback') {
    const tag = String(req.body?.tag ?? '').trim()
    if (tag && !TAG_RE.test(tag)) {
      return res.status(400).json({ error: `tag inválido (formato prod-*): ${tag}` })
    }
    if (tag) body.tag = tag
    if (req.body?.restore_db) body.restore_db = true
  }
  if (action === 'reject') {
    const branch = String(req.body?.branch ?? '').trim()
    if (branch && !BRANCH_RE.test(branch)) {
      return res.status(400).json({ error: `branch inválido (solo rr-feature-*): ${branch}` })
    }
    if (branch) body.branch = branch
  }

  const id = `deploy-${Date.now()}-${randomBytes(3).toString('hex')}`
  try {
    await fs.mkdir(QUEUE_DIR, { recursive: true })
    await fs.writeFile(path.join(QUEUE_DIR, `${id}.json`), JSON.stringify(body), { flag: 'wx' })
  } catch (e) {
    return res.status(500).json({ error: `No se pudo encolar: ${String(e).slice(0, 200)}` })
  }
  res.status(202).json({ id, queued: true })
}

/** POST /api/deployments/promote {nonce} → encola promote. */
deploymentsRouter.post('/deployments/promote', (req: Request, res: Response) =>
  enqueue(req, res, 'promote'),
)

/** POST /api/deployments/rollback {nonce, tag?, restore_db?} → encola rollback. */
deploymentsRouter.post('/deployments/rollback', (req: Request, res: Response) => {
  void enqueue(req, res, 'rollback')
})

/** POST /api/deployments/reject {nonce, branch?} → encola rechazo de staging. */
deploymentsRouter.post('/deployments/reject', (req: Request, res: Response) => {
  void enqueue(req, res, 'reject')
})

/** GET /api/deployments/status/:id — resultado de una acción encolada. */
deploymentsRouter.get('/deployments/status/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id)
  if (!/^deploy-\d+-[a-f0-9]{6}$/.test(id)) {
    return res.status(400).json({ error: 'id inválido' })
  }
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, `${id}.result.json`), 'utf8')
    return res.type('json').send(raw)
  } catch {
    return res.json({ id, pending: true })
  }
})