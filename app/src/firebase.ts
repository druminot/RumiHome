const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseEnabled =
  Boolean(firebaseConfig.apiKey) && Boolean(firebaseConfig.projectId)

let initialized = false

/** Inicializa Firebase la primera vez que se necesita (lazy, sin top-level await). */
export async function ensureFirebase(): Promise<void> {
  if (!firebaseEnabled || initialized) return
  const { initializeApp } = await import('firebase/app')
  const { getAuth } = await import('firebase/auth')
  initializeApp(firebaseConfig)
  getAuth()
  initialized = true
}

/** Devuelve el token JWT de Firebase del usuario autenticado, o null. */
export async function getIdToken(): Promise<string | null> {
  if (!firebaseEnabled) return null
  await ensureFirebase()
  const { getAuth } = await import('firebase/auth')
  const auth = getAuth()
  if (!auth.currentUser) return null
  return auth.currentUser.getIdToken()
}