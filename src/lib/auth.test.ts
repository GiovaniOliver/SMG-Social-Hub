import { describe, it, expect } from 'vitest'
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  isAuthConfigured,
} from './auth'

process.env.AUTH_SECRET = 'test-secret-abc'
process.env.APP_PASSWORD = 'hunter2'

// Independent signer mirroring auth.ts, used to forge tokens (e.g. expired /
// wrong-secret) that a fresh createSessionToken can't produce.
function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64) as BufferSource)
  return `${payloadB64}.${b64url(new Uint8Array(sig))}`
}

describe('session tokens', () => {
  it('verifies a freshly created token', async () => {
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('rejects a token signed with a different secret', async () => {
    const forged = await sign({ iat: Date.now(), exp: Date.now() + 100000 }, 'wrong-secret')
    expect(await verifySessionToken(forged)).toBe(false)
  })

  it('rejects an expired token even when correctly signed', async () => {
    const expired = await sign({ iat: Date.now() - 200000, exp: Date.now() - 1000 }, 'test-secret-abc')
    expect(await verifySessionToken(expired)).toBe(false)
  })

  it('rejects a token whose payload was tampered with', async () => {
    const token = await createSessionToken()
    const [payload, sig] = token.split('.')
    // flip the first payload char to a different base64url char
    const tampered = `${payload[0] === 'A' ? 'B' : 'A'}${payload.slice(1)}.${sig}`
    expect(await verifySessionToken(tampered)).toBe(false)
  })

  it('rejects malformed, empty, and missing tokens', async () => {
    expect(await verifySessionToken('not-a-token')).toBe(false)
    expect(await verifySessionToken('')).toBe(false)
    expect(await verifySessionToken(undefined)).toBe(false)
    expect(await verifySessionToken(null)).toBe(false)
  })
})

describe('verifyPassword', () => {
  it('accepts the correct password', () => {
    expect(verifyPassword('hunter2')).toBe(true)
  })

  it('rejects an incorrect password', () => {
    expect(verifyPassword('wrong')).toBe(false)
    expect(verifyPassword('hunter2 ')).toBe(false) // trailing space → different length
    expect(verifyPassword('')).toBe(false)
  })

  it('rejects everything when APP_PASSWORD is unset', () => {
    const saved = process.env.APP_PASSWORD
    delete process.env.APP_PASSWORD
    expect(verifyPassword('hunter2')).toBe(false)
    process.env.APP_PASSWORD = saved
  })
})

describe('isAuthConfigured', () => {
  it('is true when both secret and password are set', () => {
    expect(isAuthConfigured()).toBe(true)
  })

  it('is false when the signing secret is missing', () => {
    const saved = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET
    expect(isAuthConfigured()).toBe(false)
    process.env.AUTH_SECRET = saved
  })
})
