import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLoginPage from './pages/AdminLogin'
import AdminDashboardPage from './pages/AdminDashboard'
import GuestLoginPage from './pages/GuestLogin'
import GuestReservationPage from './pages/GuestReservation'
import './styles.css'

const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH ?? '/admin'
const GUEST_PATH = import.meta.env.VITE_GUEST_PATH ?? '/reserva'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ADMIN_PATH} element={<AdminLoginPage />} />
        <Route path={`${ADMIN_PATH}/panel`} element={<AdminDashboardPage />} />
        <Route path={GUEST_PATH} element={<GuestLoginPage />} />
        <Route path={`${GUEST_PATH}/:pnr`} element={<GuestReservationPage />} />
        <Route path="*" element={<Navigate to={ADMIN_PATH} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)