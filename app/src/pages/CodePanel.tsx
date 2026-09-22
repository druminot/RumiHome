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
    const r = await api('/api/deployments/history')
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
      const n = await api('/api/deployments/nonce')
      if (!n.ok) { setResult(`❌ ${n.data?.error ?? 'nonce falló'}`); return }
      const body: Record<string, string | boolean> = { nonce: n.data.nonce }
      if (kind === 'rollback' && tag) { body.tag = tag; body.restore_db = restoreDb }
      const r = await api(`/api/deployments/${kind}`, { method: 'POST', body: JSON.stringify(body) })
      if (r.status !== 202) { setResult(`❌ ${r.data?.error ?? `HTTP ${r.status}`}`); return }
      // Polling del resultado (máx 30 min)
      for (let i = 0; i < 900; i++) {
        await new Promise((s) => setTimeout(s, 2000))
        const st = await api(`/api/deployments/status/${r.data.id}`)
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
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