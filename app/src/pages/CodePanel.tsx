import { useEffect, useState, useCallback } from 'react'
import { firebaseEnabled, getAuthInstance, signInWithEmailAndPassword, getIdToken, signOut } from '../firebase'

/**
 * CodePanel — rumihome.io/code: control de versiones estilo GitHub.
 * Login inline (sin redirect) + timeline prod + cambios del agente + promote/rollback.
 */

interface CommitFile { path: string; add: number; del: number }
interface Commit {
  sha: string; full_sha?: string; author: string; date: string; msg: string
  files: CommitFile[]; total_add: number; total_del: number
}
interface ProdTag { tag: string; date: string; commit_count: number; commits: Commit[] }
interface HistoryData {
  generated_at: string
  prod: { sha: string; tag: string | null }
  tags: ProdTag[]
  staging: { branch: string; sha: string; ahead: Commit[]; ahead_count: number }
  branches: { name: string; sha: string; date: string; ahead_of_rr: number }[]
}

// API path por entorno (VITE_API_PATH en compose; default /api para prod/dev)
const API_BASE = import.meta.env.VITE_API_PATH ?? '/api'

const timeAgo = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 90) return 'ahora'
  if (d < 3600) return `${Math.round(d / 60)} min`
  if (d < 86400) return `${Math.round(d / 3600)} h`
  return `${Math.round(d / 86400)} d`
}

export default function CodePanelPage() {
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('admin_token'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authing, setAuthing] = useState(false)

  const [history, setHistory] = useState<HistoryData | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openCommit, setOpenCommit] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<null | { kind: 'promote' | 'rollback'; tag?: string }>(null)
  const [restoreDb, setRestoreDb] = useState(false)

  const api = useCallback(async (pathUrl: string, opts: RequestInit = {}) => {
    const res = await fetch(pathUrl, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  }, [token])

  const loadHistory = useCallback(async () => {
    const r = await api(`${API_BASE}/deployments/history`)
    if (r.ok) { setHistory(r.data); setLoadErr(null) } else setLoadErr(r.data?.error ?? `HTTP ${r.status}`)
  }, [api])

  useEffect(() => {
    if (!token) return
    loadHistory()
    const t = setInterval(loadHistory, 30_000)
    return () => clearInterval(t)
  }, [token, loadHistory])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(null); setAuthing(true)
    try {
      if (!firebaseEnabled || !getAuthInstance()) {
        setAuthError('Firebase no configurado (VITE_FIREBASE_* en .env)')
        return
      }
      await signInWithEmailAndPassword(getAuthInstance()!, email, password)
      const tok = await getIdToken()
      sessionStorage.setItem('admin_token', tok ?? '')
      setToken(tok)
      setPassword('')
    } catch {
      setAuthError('Credenciales inválidas o error de conexión.')
    } finally {
      setAuthing(false)
    }
  }

  async function runAction(kind: 'promote' | 'rollback', tag?: string) {
    setConfirmAction(null)
    setBusy(kind === 'promote' ? 'promote' : `rollback-${tag}`)
    setResult(null)
    try {
      const n = await api(`${API_BASE}/deployments/nonce`)
      if (!n.ok) { setResult(`❌ ${n.data?.error ?? 'nonce falló'}`); return }
      const body: Record<string, string | boolean> = { nonce: n.data.nonce }
      if (kind === 'rollback' && tag) { body.tag = tag; body.restore_db = restoreDb }
      const r = await api(`${API_BASE}/deployments/${kind}`, { method: 'POST', body: JSON.stringify(body) })
      if (r.status !== 202) { setResult(`❌ ${r.data?.error ?? `HTTP ${r.status}`}`); return }
      // Polling del resultado (máx 30 min)
      for (let i = 0; i < 900; i++) {
        await new Promise((s) => setTimeout(s, 2000))
        const st = await api(`${API_BASE}/deployments/status/${r.data.id}`)
        if (st.status === 200 && !st.data.pending) {
          const d = st.data
          setResult(d.ok ? `✅ ${kind === 'promote' ? 'Promote' : 'Rollback'} OK${d.dry_run ? ' (staging dry-run)' : ''}\n${(d.output ?? d.detail ?? '').slice(-600)}` : `❌ FALLO (rc=${d.rc ?? '?'}):\n${(d.output ?? d.error ?? '').slice(-600)}`)
          return
        }
      }
      setResult('⏱ La acción sigue corriendo (promote puede tardar ~10 min). Recarga más tarde.')
    } finally {
      setBusy(null)
      loadHistory()
    }
  }

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <p className="subtitle">Control de versiones — acceso administrador</p>
          {authError && <div className="alert error" role="alert">{authError}</div>}
          <form onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={authing} className="btn btn-primary" style={{ width: '100%' }}>
              {authing ? 'Ingresando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const ahead = history?.staging.ahead ?? []

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 16px 80px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>RumiHome — Control de versiones</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
            prod <code>{history?.prod.sha ?? '…'}</code>{history?.prod.tag && <> · tag <code>{history.prod.tag}</code></>}
            {' · '}staging <code>{history?.staging.sha ?? '…'}</code>
            {history && history.staging.ahead_count > 0 && (
              <strong style={{ color: '#B45309' }}> · staging adelantado por {history.staging.ahead_count} commit(s)</strong>
            )}
          </p>
        </div>
        <button className="btn" onClick={async () => { await signOut(getAuthInstance()!); sessionStorage.removeItem('admin_token'); setToken(null) }}>
          Salir
        </button>
      </header>

      {loadErr && <div className="alert error">{loadErr}</div>}

      {/* Cambios del agente pendientes */}
      {ahead.length > 0 && (
        <section style={{ border: '2px solid #B45309', borderRadius: 12, padding: 16, marginBottom: 20, background: '#FFFBEB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>⏳ Cambios del agente pendientes ({ahead.length})</h2>
            <button className="btn btn-primary" disabled={busy != null} onClick={() => setConfirmAction({ kind: 'promote' })}>
              {busy === 'promote' ? 'Ejecutando…' : 'MERGE → PROD'}
            </button>
          </div>
          <CommitList commits={ahead} openCommit={openCommit} setOpenCommit={setOpenCommit} />
        </section>
      )}

      {/* Timeline de prod */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <section>
        <h2 style={{ fontSize: 18 }}>Historial de producción</h2>
        {(history?.tags ?? []).map((t, i) => (
          <div key={t.tag} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{t.tag}</strong>
                <span style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>{t.commit_count} commit(s)</span>
                {i === 0 && history?.prod.tag === t.tag && <span style={{ background: '#10B981', color: 'white', borderRadius: 6, padding: '2px 8px', marginLeft: 8, fontSize: 12 }}>PROD actual</span>}
              </div>
              {i > 0 && (
                <button className="btn" disabled={busy != null} onClick={() => setConfirmAction({ kind: 'rollback', tag: t.tag })}>
                  {busy === `rollback-${t.tag}` ? 'Ejecutando…' : 'Volver aquí'}
                </button>
              )}
            </div>
            {t.commits.length > 0 && <CommitList commits={t.commits} openCommit={openCommit} setOpenCommit={setOpenCommit} />}
          </div>
        ))}
      </section>

      {/* Branches en desarrollo */}
      {(history?.branches ?? []).filter((b) => b.ahead_of_rr > 0).length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18 }}>Branches en desarrollo</h2>
          {history!.branches.filter((b) => b.ahead_of_rr > 0).map((b) => (
            <div key={b.name} style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 14 }}>
              <code>{b.sha}</code> <strong>{b.name}</strong> · {b.ahead_of_rr} commit(s) sobre staging
            </div>
          ))}
        </section>
      )}
        </div>

        {/* Columna derecha: árbol git visual */}
        <div style={{ width: 360, flexShrink: 0, position: 'sticky', top: 16 }}>
          <GitTree history={history} onPromote={() => ahead.length > 0 && setConfirmAction({ kind: 'promote' })} aheadCount={ahead.length} />
        </div>
      </div>

      {/* Modal de confirmación */}
      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setConfirmAction(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 480, width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{confirmAction.kind === 'promote' ? 'Pasar a PROD' : `Rollback a ${confirmAction.tag}`}</h3>
            {confirmAction.kind === 'promote' ? (
              <p>Esto fusionará los {ahead.length} commit(s) pendientes a PROD con healthcheck y punto de rollback automático (~10 min).</p>
            ) : (
              <>
                <p>Prod volverá al estado de <code>{confirmAction.tag}</code>.</p>
                <label style={{ display: 'block', margin: '12px 0' }}>
                  <input type="checkbox" checked={restoreDb} onChange={(e) => setRestoreDb(e.target.checked)} /> Restaurar la DB también (si existe backup)
                </label>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { const a = confirmAction; setRestoreDb(false); runAction(a.kind, a.tag) }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setResult(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 640, width: '90%', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13, maxHeight: '70vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {result}
            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <button className="btn" onClick={() => setResult(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ marginTop: 40, color: '#999', fontSize: 12 }}>
        Datos generados {history && `hace ${timeAgo(history.generated_at)}`} · botón MERGE encola una acción validada; el executor del host aplica healthcheck + auto-rollback.
      </footer>
    </div>
  )
}

/**
 * GitTree — dibujo SVG del árbol de versiones (vertical, reciente abajo).
 *   · línea PROD (verde): nodo por tag prod-*
 *   · línea STAGING (ámbar): commits del agente no promovidos (si los hay)
 *   · ramitas FEATURES (azul): SIEMPRE nacen del ÚLTIMO nodo activo
 *   · flecha MERGE staging→prod cuando hay pendientes
 */
function GitTree({ history, onPromote, aheadCount }: {
  history: HistoryData | null
  onPromote: () => void
  aheadCount: number
}) {
  const W = 360
  const PAD_TOP = 34
  const X_PROD = 24, X_STG = 150, X_FEAT = 250
  const rowH = 28

  const tags = (history?.tags ?? []).slice(0, 8)
  const ahead = (history?.staging.ahead ?? []).slice(0, 6)
  const feats = (history?.branches ?? []).filter((b) => b.ahead_of_rr > 0).slice(0, 5)

  const stgRows = ahead.length
  const H = PAD_TOP + (tags.length + stgRows + feats.length + 3) * rowH

  const prodStart = PAD_TOP
  const prodEndY = prodStart + Math.max(tags.length - 1, 0) * rowH
  const stgStart = prodEndY + rowH * 1.4
  const stgEndY = stgStart + Math.max(stgRows - 1, 0) * rowH
  const featOriginY = stgRows > 0 ? stgEndY : prodEndY
  const featOriginX = stgRows > 0 ? X_STG : X_PROD
  const featStart = featOriginY + rowH * 1.4

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, background: '#FAFAFA' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>🌳 Árbol de versiones</h3>
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }} viewBox={`0 0 ${W} ${H}`}>
        <g fontSize="11" fill="#666">
          <circle cx={16} cy={12} r={5} fill="#10B981" /> <text x={25} y={16}>prod</text>
          <circle cx={70} cy={12} r={5} fill="#F59E0B" /> <text x={79} y={16}>staging</text>
          <circle cx={140} cy={12} r={5} fill="#3B82F6" /> <text x={149} y={16}>features</text>
        </g>
        <line x1={X_PROD} y1={prodStart} x2={X_PROD} y2={prodEndY} stroke="#10B981" strokeWidth={3} />
        {tags.map((t, i) => (
          <g key={t.tag}>
            <circle cx={X_PROD} cy={prodStart + i * rowH} r={6} fill="#10B981" />
            <text x={X_PROD + 14} y={prodStart + i * rowH + 4} fontSize="11" fill="#333">
              {t.tag.replace('prod-', '')} <tspan fill="#999">· {t.commit_count}c</tspan>
            </text>
          </g>
        ))}
        {stgRows > 0 && (
          <>
            <path d={`M ${X_PROD} ${prodEndY} C ${X_PROD} ${prodEndY + 12}, ${X_STG} ${stgStart - 12}, ${X_STG} ${stgStart}`} fill="none" stroke="#F59E0B" strokeWidth={2.5} />
            {ahead.map((c, i) => (
              <g key={c.sha}>
                {i < stgRows - 1 && <line x1={X_STG} y1={stgStart + i * rowH + 6} x2={X_STG} y2={stgStart + (i + 1) * rowH - 6} stroke="#F59E0B" strokeWidth={2} />}
                <circle cx={X_STG} cy={stgStart + i * rowH} r={5} fill="#F59E0B" />
                <text x={X_STG + 14} y={stgStart + i * rowH + 4} fontSize="10" fill="#444">{c.msg.slice(0, 24)}</text>
              </g>
            ))}
            <path d={`M ${X_STG - 10} ${stgEndY} C ${X_PROD + 40} ${stgEndY + 16}, ${X_PROD + 40} ${prodEndY - 16}, ${X_PROD + 12} ${prodEndY - 4}`} fill="none" stroke="#B45309" strokeWidth={2} strokeDasharray="4 3" markerEnd="url(#arrow)" />
            <text x={X_PROD + 42} y={stgEndY - 12} fontSize="10" fill="#B45309" fontWeight="bold">MERGE</text>
          </>
        )}
        {feats.map((b, i) => {
          const by = featStart + i * rowH
          return (
            <g key={b.name}>
              <path d={`M ${featOriginX} ${featOriginY} C ${featOriginX + 40} ${featOriginY}, ${X_FEAT - 40} ${by}, ${X_FEAT - 10} ${by}`} fill="none" stroke="#93C5FD" strokeWidth={2} />
              <circle cx={X_FEAT} cy={by} r={5} fill="#3B82F6" />
              <text x={X_FEAT + 10} y={by + 4} fontSize="10" fill="#444">{b.name.replace('rr-feature-', '').slice(0, 24)}</text>
            </g>
          )
        })}
        <circle cx={featOriginX} cy={featOriginY} r={8} fill="none" stroke={stgRows > 0 ? '#F59E0B' : '#10B981'} strokeWidth={2}>
          <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
        </circle>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#B45309" />
          </marker>
        </defs>
      </svg>
      {aheadCount > 0 && (
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={onPromote}>
          ▲ MERGE {aheadCount} commit(s) → PROD
        </button>
      )}
    </div>
  )
}

function CommitList({ commits, openCommit, setOpenCommit }: {
  commits: Commit[]
  openCommit: string | null
  setOpenCommit: (v: string | null) => void
}) {
  return (
    <div style={{ marginTop: 10 }}>
      {commits.map((c) => {
        const cid = c.full_sha ?? c.sha
        const open = openCommit === cid
        const total = c.total_add + c.total_del
        return (
          <div key={cid} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
            <div onClick={() => setOpenCommit(open ? null : cid)} style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14 }}>
              <code style={{ color: '#6B7280' }}>{c.sha}</code>
              <span style={{ flex: 1 }}>{c.msg}</span>
              <span style={{ color: '#10B981' }}>+{c.total_add}</span>
              <span style={{ color: '#EF4444' }}>−{c.total_del}</span>
            </div>
            {open && (
              <div style={{ margin: '6px 0 0 60px', fontSize: 13 }}>
                <div style={{ color: '#888' }}>{c.author} · {timeAgo(c.date)}</div>
                <div style={{ height: 4, background: '#FEE2E2', borderRadius: 2, width: Math.min(total, 300), marginTop: 4 }}>
                  <div style={{ width: `${total ? (c.total_add / total) * 100 : 0}%`, background: '#10B981', height: '100%' }} />
                </div>
                {c.files.map((f) => (
                  <div key={f.path} style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</span>
                    <span style={{ color: '#10B981' }}>+{f.add}</span>
                    <span style={{ color: '#EF4444' }}>−{f.del}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}