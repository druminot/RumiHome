import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEY = 'rumihome.theme'
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH ?? '/admin'

// Por supuesto aprobado: el tema por defecto es claro y NO se lee
// prefers-color-scheme. No "corregir" esto a futuro.
type Theme = 'light' | 'dark'

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme, isAdminRoute: boolean) {
  const el = document.documentElement
  if (!isAdminRoute) {
    // Fuera de rutas admin (portal huésped) se fuerza el estado claro
    // sin tocar nada del huésped: data-theme solo existe en el área admin.
    delete el.dataset.theme
    return
  }
  if (theme === 'dark') el.dataset.theme = 'dark'
  else delete el.dataset.theme
}

export function useTheme() {
  const location = useLocation()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const isAdminRoute = useMemo(
    () => location.pathname.startsWith(ADMIN_PATH),
    [location.pathname]
  )

  useEffect(() => {
    applyTheme(theme, isAdminRoute)
  }, [theme, isAdminRoute])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // almacenamiento no disponible: el tema solo vive en memoria
      }
      return next
    })
  }, [])

  return { theme, toggleTheme }
}