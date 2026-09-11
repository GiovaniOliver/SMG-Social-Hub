import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOAuthState, verifyOAuthState } from './oauth-state'

describe('OAuth state signing', () => {
  const originalSecret = process.env.AUTH_SECRET

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret-for-oauth-state-signing'
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
  })

  it('round-trips a valid signed state', async () => {
    const state = await createOAuthState('brand-123', 'facebook')
    const verified = await verifyOAuthState(state, 'facebook')

    expect(verified?.brandId).toBe('brand-123')
    expect(verified?.provider).toBe('facebook')
  })

  it('round-trips an account-first state without a brand', async () => {
    const state = await createOAuthState(null, 'x', 'creator@example.com')
    const verified = await verifyOAuthState(state, 'x')

    expect(verified?.brandId).toBeNull()
    expect(verified?.subject).toBe('creator@example.com')
    expect(verified?.provider).toBe('x')
  })

  it('rejects a state for a different provider', async () => {
    const state = await createOAuthState('brand-123', 'google')
    await expect(verifyOAuthState(state, 'linkedin')).resolves.toBeNull()
  })

  it('rejects a tampered state', async () => {
    const state = await createOAuthState('brand-123', 'tiktok')
    const final = state.at(-1) ?? 'A'
    const tampered = `${state.slice(0, -1)}${final === 'A' ? 'B' : 'A'}`

    await expect(verifyOAuthState(tampered, 'tiktok')).resolves.toBeNull()
  })
})
