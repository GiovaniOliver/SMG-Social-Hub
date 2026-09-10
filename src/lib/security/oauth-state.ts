export type OAuthProvider = 'facebook' | 'google' | 'linkedin' | 'tiktok'

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface OAuthStatePayload {
  brandId: string | null
  provider: OAuthProvider
  ts: number
  nonce: string
  sig: string
}

export interface VerifiedOAuthState {
  brandId: string | null
  provider: OAuthProvider
  ts: number
  nonce: string
}

type UnsignedOAuthState = VerifiedOAuthState

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET
  return secret && secret.length > 0 ? secret : null
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

function canonicalState(payload: UnsignedOAuthState): string {
  return JSON.stringify({
    brandId: payload.brandId,
    provider: payload.provider,
    ts: payload.ts,
    nonce: payload.nonce,
  })
}

export async function createOAuthState(
  brandId: string | null | undefined,
  provider: OAuthProvider
): Promise<string> {
  const secret = getSecret()
  if (!secret) throw new Error('AUTH_SECRET is not configured')

  const nonceBytes = new Uint8Array(18)
  crypto.getRandomValues(nonceBytes)

  const unsigned: UnsignedOAuthState = {
    brandId: brandId || null,
    provider,
    ts: Date.now(),
    nonce: bytesToBase64Url(nonceBytes),
  }

  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(canonicalState(unsigned)) as BufferSource
  )

  const payload: OAuthStatePayload = {
    ...unsigned,
    sig: bytesToBase64Url(new Uint8Array(signature)),
  }

  return bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
}

export async function verifyOAuthState(
  state: string | null | undefined,
  expectedProvider: OAuthProvider
): Promise<VerifiedOAuthState | null> {
  const secret = getSecret()
  if (!secret || !state) return null

  try {
    const payload = JSON.parse(
      decoder.decode(base64UrlToBytes(state))
    ) as Partial<OAuthStatePayload>

    const brandIdIsValid =
      payload.brandId === null ||
      (typeof payload.brandId === 'string' && payload.brandId.length > 0)

    if (
      !brandIdIsValid ||
      payload.provider !== expectedProvider ||
      typeof payload.ts !== 'number' ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length === 0 ||
      typeof payload.sig !== 'string' ||
      payload.sig.length === 0
    ) {
      return null
    }

    const age = Date.now() - payload.ts
    if (age < 0 || age > OAUTH_STATE_MAX_AGE_MS) return null

    const unsigned: UnsignedOAuthState = {
      brandId: payload.brandId ?? null,
      provider: payload.provider,
      ts: payload.ts,
      nonce: payload.nonce,
    }

    const key = await hmacKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(payload.sig) as BufferSource,
      encoder.encode(canonicalState(unsigned)) as BufferSource
    )

    return valid ? unsigned : null
  } catch {
    return null
  }
}
