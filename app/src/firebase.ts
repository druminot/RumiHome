import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseEnabled =
  Boolean(firebaseConfig.apiKey) && Boolean(firebaseConfig.projectId)

let authInstance: Auth | null = null

if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig)
  authInstance = getAuth(app)
}

export function getAuthInstance(): Auth | null {
  return authInstance
}

export async function getIdToken(): Promise<string | null> {
  if (!authInstance?.currentUser) return null
  return authInstance.currentUser.getIdToken()
}

export { signInWithEmailAndPassword, signOut }