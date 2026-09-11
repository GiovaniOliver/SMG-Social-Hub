import 'server-only'

import { executeArcadeTool, getArcadeExecutionValue } from '@/lib/arcade'
import {
  getSocialAccountVerificationContext,
  recordSocialAccountVerification,
  type ConnectionStatus,
  type SocialAccountRow,
} from '@/lib/social-accounts'
import type { Platform } from '@/types'

export interface AccountVerificationResult {
  accountId: string
  platform: Platform
  success: boolean
  status: ConnectionStatus
  message: string
  verifiedAt: string | null
}

export class SocialAccountNotFoundError extends Error {}

class ProviderVerificationError extends Error {
  constructor(
    message: string,
    readonly status: ConnectionStatus = 'ERROR'
  ) {
    super(message)
  }
}

function providerLabel(platform: Platform): string {
  if (platform === 'TWITTER') return 'X'
  if (platform === 'YOUTUBE') return 'YouTube'
  return platform.charAt(0) + platform.slice(1).toLowerCase()
}

function looksLikeAuthorizationFailure(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true
  const normalized = body.toLowerCase()
  return (
    normalized.includes('access token') ||
    normalized.includes('invalid oauth') ||
    normalized.includes('oauth') && normalized.includes('expired') ||
    normalized.includes('authorization') && normalized.includes('invalid') ||
    normalized.includes('unauthorized')
  )
}

async function fetchProviderJson(
  platform: Platform,
  url: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ProviderVerificationError(
      `${providerLabel(platform)} could not be reached. Try verification again.`,
      'ERROR'
    )
  }

  const text = await response.text()
  if (!response.ok) {
    const reauth = looksLikeAuthorizationFailure(response.status, text)
    throw new ProviderVerificationError(
      reauth
        ? `${providerLabel(platform)} rejected the stored authorization. Reconnect this account.`
        : `${providerLabel(platform)} verification failed (HTTP ${response.status}).`,
      reauth ? 'NEEDS_REAUTH' : 'ERROR'
    )
  }

  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new ProviderVerificationError(
      `${providerLabel(platform)} returned an unreadable verification response.`,
      'ERROR'
    )
  }
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

function assertIdentityMatches(
  expected: string | null,
  actual: string | null,
  platform: Platform
): void {
  if (!expected || !actual || expected === actual) return
  throw new ProviderVerificationError(
    `${providerLabel(platform)} authorization is valid, but it belongs to a different account than the stored identity.`,
    'ERROR'
  )
}

async function verifyMeta(
  account: SocialAccountRow,
  accessToken: string
): Promise<void> {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v26.0'
  const externalId = account.externalAccountId || 'me'
  const fields =
    account.platform === 'INSTAGRAM'
      ? 'id,username,name'
      : 'id,name'
  const url =
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(externalId)}` +
    `?fields=${encodeURIComponent(fields)}`

  const data = await fetchProviderJson(account.platform, url, accessToken)
  assertIdentityMatches(account.externalAccountId, stringValue(data.id), account.platform)
}

async function verifyYouTube(
  account: SocialAccountRow,
  accessToken: string
): Promise<void> {
  const url = 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=1'
  const data = await fetchProviderJson('YOUTUBE', url, accessToken)
  const items = Array.isArray(data.items)
    ? (data.items as Array<Record<string, unknown>>)
    : []
  const channelId = stringValue(items[0]?.id)

  if (!channelId) {
    throw new ProviderVerificationError(
      'Google authorization is valid, but no YouTube channel was returned.',
      'ERROR'
    )
  }

  const expected =
    account.externalAccountId && !account.externalAccountId.startsWith('google-user:')
      ? account.externalAccountId
      : null
  assertIdentityMatches(expected, channelId, 'YOUTUBE')
}

async function verifyLinkedIn(
  account: SocialAccountRow,
  accessToken: string
): Promise<void> {
  const data = await fetchProviderJson(
    'LINKEDIN',
    'https://api.linkedin.com/v2/userinfo',
    accessToken
  )
  assertIdentityMatches(account.externalAccountId, stringValue(data.sub), 'LINKEDIN')
}

async function verifyTikTok(
  account: SocialAccountRow,
  accessToken: string
): Promise<void> {
  const data = await fetchProviderJson(
    'TIKTOK',
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
    accessToken
  )
  const nestedData =
    data.data && typeof data.data === 'object' && !Array.isArray(data.data)
      ? (data.data as Record<string, unknown>)
      : null
  const user =
    nestedData?.user && typeof nestedData.user === 'object' && !Array.isArray(nestedData.user)
      ? (nestedData.user as Record<string, unknown>)
      : null
  assertIdentityMatches(account.externalAccountId, stringValue(user?.open_id), 'TIKTOK')
}

async function verifyArcade(
  platform: 'TWITTER' | 'REDDIT',
  arcadeUserId: string
): Promise<void> {
  try {
    const execution = await executeArcadeTool({
      toolName: platform === 'TWITTER' ? 'X.WhoAmI' : 'Reddit.GetMyUsername',
      userId: arcadeUserId,
    })
    const value = getArcadeExecutionValue(execution)
    if (value === null || value === undefined || value === '') {
      throw new Error('Identity was empty')
    }
  } catch {
    throw new ProviderVerificationError(
      `${providerLabel(platform)} authorization needs to be reconnected through Arcade.`,
      'NEEDS_REAUTH'
    )
  }
}

async function runProviderVerification(input: {
  account: SocialAccountRow
  connection: NonNullable<
    Awaited<ReturnType<typeof getSocialAccountVerificationContext>>
  >['connection'] & {}
}): Promise<void> {
  const { account, connection } = input
  if (!connection) {
    throw new ProviderVerificationError('No provider connection is attached to this account.', 'DISCONNECTED')
  }

  switch (account.platform) {
    case 'FACEBOOK':
    case 'INSTAGRAM':
      return verifyMeta(account, connection.accessToken)
    case 'YOUTUBE':
      return verifyYouTube(account, connection.accessToken)
    case 'LINKEDIN':
      return verifyLinkedIn(account, connection.accessToken)
    case 'TIKTOK':
      return verifyTikTok(account, connection.accessToken)
    case 'TWITTER':
    case 'REDDIT':
      if (!connection.accountId) {
        throw new ProviderVerificationError(
          `${providerLabel(account.platform)} is missing its Arcade identity. Reconnect this account.`,
          'NEEDS_REAUTH'
        )
      }
      return verifyArcade(account.platform, connection.accountId)
    default:
      throw new ProviderVerificationError('This provider does not support connection verification yet.', 'ERROR')
  }
}

export async function verifySocialAccountConnection(
  accountId: string
): Promise<AccountVerificationResult> {
  const context = await getSocialAccountVerificationContext(accountId)
  if (!context) throw new SocialAccountNotFoundError('Social account not found')

  const { account, connection } = context

  if (!connection) {
    const message = 'No provider connection is attached to this account.'
    await recordSocialAccountVerification({
      accountId,
      status: 'DISCONNECTED',
      success: false,
      message,
    })
    return {
      accountId,
      platform: account.platform,
      success: false,
      status: 'DISCONNECTED',
      message,
      verifiedAt: account.lastVerifiedAt,
    }
  }

  if (!connection.isActive) {
    const message = 'The stored provider connection is inactive. Reconnect this account.'
    await recordSocialAccountVerification({
      accountId,
      status: 'DISCONNECTED',
      success: false,
      message,
    })
    return {
      accountId,
      platform: account.platform,
      success: false,
      status: 'DISCONNECTED',
      message,
      verifiedAt: account.lastVerifiedAt,
    }
  }

  if (connection.platform !== account.platform) {
    const message = 'The stored provider connection does not match this account platform.'
    await recordSocialAccountVerification({
      accountId,
      status: 'ERROR',
      success: false,
      message,
    })
    return {
      accountId,
      platform: account.platform,
      success: false,
      status: 'ERROR',
      message,
      verifiedAt: account.lastVerifiedAt,
    }
  }

  if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now()) {
    const message = 'The stored access token has expired. Reconnect this account.'
    await recordSocialAccountVerification({
      accountId,
      status: 'NEEDS_REAUTH',
      success: false,
      message,
    })
    return {
      accountId,
      platform: account.platform,
      success: false,
      status: 'NEEDS_REAUTH',
      message,
      verifiedAt: account.lastVerifiedAt,
    }
  }

  try {
    await runProviderVerification({
      account,
      connection,
    })

    const verifiedAt = new Date().toISOString()
    const message = `${providerLabel(account.platform)} connection verified successfully.`
    await recordSocialAccountVerification({
      accountId,
      status: 'CONNECTED',
      success: true,
      message,
    })

    return {
      accountId,
      platform: account.platform,
      success: true,
      status: 'CONNECTED',
      message,
      verifiedAt,
    }
  } catch (error) {
    const failure =
      error instanceof ProviderVerificationError
        ? error
        : new ProviderVerificationError('Connection verification failed unexpectedly.', 'ERROR')

    await recordSocialAccountVerification({
      accountId,
      status: failure.status,
      success: false,
      message: failure.message,
    })

    return {
      accountId,
      platform: account.platform,
      success: false,
      status: failure.status,
      message: failure.message,
      verifiedAt: account.lastVerifiedAt,
    }
  }
}
