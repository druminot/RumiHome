import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { firebaseEnabled, getAuthInstance, getIdToken, signOut } from '../firebase'
import type { Property } from '../types'
import ReservasTab from './ReservasTab'
import DashboardTab from './DashboardTab'
import GastosRedesTab from './GastosRedesTab'
import RetroScroller from '../components/RetroScroller'

const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH ?? '/admin'

const marqueeText =
  '★ SISTEMA DE GESTIÓN RUMIHOME · PASE DE ADMINISTRADOR CONCEDIDO ★ ' +
  'RESERVAS ✅ · FINANZAS 💰 · DOMÓTICA 💡 · TODO EN UN SOLO LUGAR ★ ' +
  '¡AHORA CON MÁS COLORES QUE LA WEB DEL 95! ★ ' +
  'VISITA www.rumihome.io · ARRIENDO TEMPORAL EN CONCEPCIÓN ★'

type Tab = 'reservas' | 'dashboard' | 'gastos'

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('reservas')
  const [properties, setProperties] = useState<Property[]>([])

  const logout = useCallback(async () => {
    if (getAuthInstance()) await signOut(getAuthInstance()!)
    sessionStorage.removeItem('admin_token')
    navigate(ADMIN_PATH)
  }, [navigate])

  useEffect(() => {
    if (firebaseEnabled) {
      getIdToken().then((t) => {
        if (!t) navigate(ADMIN_PATH)
      })
    }
    api.listProperties().then(setProperties).catch(() => {})
  }, [navigate])

  return (
    <div className="admin-shell">
      <RetroScroller text={marqueeText} />
      <header className="admin-topbar">
        <a className="logo" href="/">rumi<span>home</span> · CRM</a>
        <nav className="main-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'reservas'} className={`main-tab ${tab === 'reservas' ? 'active' : ''}`} onClick={() => setTab('reservas')}>Reservas</button>
          <button role="tab" aria-selected={tab === 'dashboard'} className={`main-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button role="tab" aria-selected={tab === 'gastos'} className={`main-tab ${tab === 'gastos' ? 'active' : ''}`} onClick={() => setTab('gastos')}>Gastos &amp; Redes</button>
        </nav>
        <div>
          <span className="whoami">Administrador</span>
          <span className="counter">Usted es el visitante Nº 00<span className="blink">4</span></span>
          <button className="btn small ghost" onClick={logout}>SALIR</button>
        </div>
      </header>

      <main className="admin-content">
        {tab === 'reservas' && <ReservasTab />}
        {tab === 'dashboard' && <DashboardTab properties={properties} />}
        {tab === 'gastos' && <GastosRedesTab properties={properties} />}
      </main>
    </div>
  )
}