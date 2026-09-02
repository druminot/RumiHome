/**
 * Verificación de ID tokens de Firebase con node:crypto + jose.
 *
 * Firebase firma los ID tokens (RS256) con securetoken@system.gserviceaccount.com
 * y publica sus certificados x509 en un endpoint público que indica kid→cert PEM.
 * Estrategia:
 *   1. Descargar el mapa kid→PEM y cachearlo (con refresh en error de firma).
 *   2. Extraer la clave pública con X509Certificate.publicKey (node:crypto).
 *   3. Verificar el JWT con jose (iss/aud automáticos).
 *
 * Variables:
 *   FIREBASE_PROJECT_ID        → activa la verificación
 *   FIREBASE_SERVICE_ACCOUNT   → (opcional, no requerido para solo-verificar)
 */
import { X509Certificate } from 'node:crypto'
import { jwtVerify, type CryptoKey, type JWTPayload, type JWTVerifyOptions } from 'jose'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID

const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

export interface DecodedToken {
  email?: string
  sub: string
}

interface KeyStore {
  keys: Map<string, CryptoKey>
  fetchedAt: number
}

let store: KeyStore | null = null
const TTL_MS = 60 * 60 * 1000 // 1h

async function fetchCerts(force = false): Promise<KeyStore> {
  if (!force && store && Date.now() - store.fetchedAt < TTL_MS) return store
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error('No se pudieron obtener los certificados de Firebase')
  const certs = (await res.json()) as Record<string, string>
  const keys = new Map<string, CryptoKey>()
  for (const [kid, pem] of Object.entries(certs)) {
    try {
      const x509 = new X509Certificate(pem)
      keys.set(kid, x509.publicKey as unknown as CryptoKey)
    } catch {
      // cert inválido: skip
    }
  }
  store = { keys, fetchedAt: Date.now() }
  return store
}

export async function verifyIdToken(token: string): Promise<DecodedToken> {
  if (!PROJECT_ID) throw new Error('Firebase no configurado')

  const decodeHeader = (raw: string) => {
    const [h] = raw.split('.')
    return JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { kid?: string; alg: string }
  }

  const verifyWith = async (s: KeyStore): Promise<DecodedToken> => {
    const header = decodeHeader(token)
    const key = header.kid ? s.keys.get(header.kid) : [...s.keys.values()][0]
    if (!key) throw new Error('kid desconocido')
    const { payload } = await jwtVerify(token, key, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    } satisfies JWTVerifyOptions)
    return { email: payload.email as string | undefined, sub: payload.sub as string }
  }

  try {
    return await verifyWith(await fetchCerts())
  } catch {
    // Reintenta con certs frescos (rotación de claves)
    return await verifyWith(await fetchCerts(true))
  }
}

export const firebaseConfigured = Boolean(PROJECT_ID)