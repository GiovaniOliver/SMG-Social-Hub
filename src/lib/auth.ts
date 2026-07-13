// Session auth for the single shared operator login.
//
// Uses the Web Crypto API only (no Node `crypto` import) so this module can be
// imported from both the Edge middleware and Node route handlers. The session
// is a stateless HMAC-signed token stored in an HttpOnly cookie.

export const SESSION_COOKIE = 'smg_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

const encoder = new TextEncoder()

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET
  return secret && secret.length > 0 ? secret : null
}

/** True only when both the signing secret and the operator password are set. */
export function isAuthConfigured(): boolean {
  return Boolean(getSecret() && process.env.APP_PASSWORD)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((input.length + 3) % 4)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

interface SessionPayload {
  iat: number
  exp: number
}

/** Create a signed session token. Throws if AUTH_SECRET is not configured. */
export async function createSessionToken(): Promise<string> {
  const secret = getSecret()
  if (!secret) throw new Error('AUTH_SECRET is not configured')

  const now = Date.now()
  const payload: SessionPayload = { iat: now, exp: now + SESSION_MAX_AGE_SECONDS * 1000 }
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))

  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64) as BufferSource)

  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`
}

/** Verify a session token's signature and expiry. Returns false on any problem. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = getSecret()
  if (!secret || !token) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, signatureB64] = parts

  try {
    const key = await hmacKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signatureB64) as BufferSource,
      encoder.encode(payloadB64) as BufferSource
    )
    if (!valid) return false

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64))) as SessionPayload
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

/** Constant-time comparison of the supplied password against APP_PASSWORD. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected || expected.length === 0) return false

  const a = encoder.encode(input)
  const b = encoder.encode(expected)
  if (a.length !== b.length) return false

  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
