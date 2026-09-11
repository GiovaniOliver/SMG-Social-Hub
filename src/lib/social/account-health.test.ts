import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getContext, recordVerification, executeArcadeTool, getArcadeExecutionValue } = vi.hoisted(() => ({
  getContext: vi.fn(),
  recordVerification: vi.fn(),
  executeArcadeTool: vi.fn(),
  getArcadeExecutionValue: vi.fn(),
}))

vi.mock('@/lib/social-accounts', () => ({
  getSocialAccountVerificationContext: getContext,
  recordSocialAccountVerification: recordVerification,
}))

vi.mock('@/lib/arcade', () => ({
  executeArcadeTool,
  getArcadeExecutionValue,
}))

import { verifySocialAccountConnection } from './account-health'

const originalFetch = global.fetch

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    providerConnectionId: 'connection-1',
    platform: 'LINKEDIN',
    accountType: 'MEMBER',
    externalAccountId: 'member-123',
    displayName: 'Test Member',
    handle: null,
    profileUrl: null,
    avatarUrl: null,
    publishingCapability: 'AUTOMATIC',
    connectionStatus: 'CONNECTED',
    metadata: {},
    isActive: true,
    lastVerifiedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-1',
    platform: 'LINKEDIN',
    accountId: 'member-123',
    accountLabel: 'Test Member',
    accessToken: 'secret-token',
    refreshToken: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    scopes: ['w_member_social'],
    isActive: true,
    ...overrides,
  }
}

beforeEach(() => {
  getContext.mockReset()
  recordVerification.mockReset()
  executeArcadeTool.mockReset()
  getArcadeExecutionValue.mockReset()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('verifySocialAccountConnection', () => {
  it('marks manual accounts without a provider connection as disconnected', async () => {
    getContext.mockResolvedValue({
      account: account({ providerConnectionId: null, connectionStatus: 'DISCONNECTED' }),
      connection: null,
    })

    const result = await verifySocialAccountConnection('account-1')

    expect(result.status).toBe('DISCONNECTED')
    expect(result.success).toBe(false)
    expect(recordVerification).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', status: 'DISCONNECTED', success: false })
    )
  })

  it('marks expired credentials as needing reauthorization without calling the provider', async () => {
    getContext.mockResolvedValue({
      account: account(),
      connection: connection({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    })
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await verifySocialAccountConnection('account-1')

    expect(result.status).toBe('NEEDS_REAUTH')
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies a LinkedIn identity and records a successful check', async () => {
    getContext.mockResolvedValue({
      account: account(),
      connection: connection(),
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ sub: 'member-123', name: 'Test Member' }),
    }) as unknown as typeof fetch

    const result = await verifySocialAccountConnection('account-1')

    expect(result.status).toBe('CONNECTED')
    expect(result.success).toBe(true)
    expect(recordVerification).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', status: 'CONNECTED', success: true })
    )
  })

  it('classifies provider authorization rejection as needing reauthorization', async () => {
    getContext.mockResolvedValue({
      account: account(),
      connection: connection(),
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'invalid access token' }),
    }) as unknown as typeof fetch

    const result = await verifySocialAccountConnection('account-1')

    expect(result.status).toBe('NEEDS_REAUTH')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/reconnect/i)
  })

  it('verifies X through the stored Arcade identity', async () => {
    getContext.mockResolvedValue({
      account: account({
        platform: 'TWITTER',
        accountType: 'PROFILE',
        externalAccountId: 'x-123',
        handle: '@test',
      }),
      connection: connection({
        platform: 'TWITTER',
        accountId: 'smg-social-hub:x:test-id',
        accessToken: 'ARCADE_MANAGED',
        expiresAt: null,
      }),
    })
    executeArcadeTool.mockResolvedValue({ status: 'completed', output: { value: { username: 'test' } } })
    getArcadeExecutionValue.mockReturnValue({ username: 'test' })

    const result = await verifySocialAccountConnection('account-1')

    expect(result.status).toBe('CONNECTED')
    expect(result.success).toBe(true)
    expect(executeArcadeTool).toHaveBeenCalledWith({
      toolName: 'X.WhoAmI',
      userId: 'smg-social-hub:x:test-id',
    })
  })
})
