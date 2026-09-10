import { NextResponse, type NextRequest } from 'next/server'
import { executeArcadeTool, getArcadeExecutionValue } from '@/lib/arcade'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { upsertProviderConnection, upsertSocialAccount } from '@/lib/social-accounts'

function accountsRedirect(request: NextRequest, key: 'success' | 'error', message: string) {
  const url = new URL('/accounts', request.url)
  url.searchParams.set(key, message)
  return NextResponse.redirect(url)
}

function normalizeRedditUsername(value: unknown): string | null {
  if (typeof value === 'string') return value.replace(/^u\//, '').trim() || null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const nested = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : null

  for (const source of [nested, record]) {
    if (!source) continue
    for (const key of ['username', 'name', 'user_name']) {
      const candidate = source[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.replace(/^u\//, '').trim()
      }
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const verified = await verifyOAuthState(request.nextUrl.searchParams.get('state'), 'reddit')
    const arcadeUserId = verified?.subject
    if (!verified || !arcadeUserId || !arcadeUserId.startsWith('smg-social-hub:reddit:')) {
      return accountsRedirect(request, 'error', 'Invalid or expired Reddit authorization state.')
    }

    const execution = await executeArcadeTool({
      toolName: 'Reddit.GetMyUsername',
      userId: arcadeUserId,
    })
    const username = normalizeRedditUsername(getArcadeExecutionValue(execution))

    if (!username) {
      return accountsRedirect(request, 'error', 'Reddit authorization completed, but the username could not be read.')
    }

    const handle = `u/${username}`
    const connection = await upsertProviderConnection({
      platform: 'REDDIT',
      accountId: arcadeUserId,
      accountLabel: handle,
      accessToken: 'ARCADE_MANAGED',
      scopes: ['identity', 'read', 'submit'],
    })

    await upsertSocialAccount({
      providerConnectionId: connection.id,
      platform: 'REDDIT',
      accountType: 'PROFILE',
      externalAccountId: `username:${username.toLowerCase()}`,
      displayName: username,
      handle,
      profileUrl: `https://www.reddit.com/user/${encodeURIComponent(username)}/`,
      publishingCapability: 'AUTOMATIC',
      connectionStatus: 'CONNECTED',
      metadata: {
        credentialStore: 'arcade',
        arcadeUserId,
        arcadeProvider: 'reddit',
        identityTool: 'Reddit.GetMyUsername',
      },
      lastVerifiedAt: new Date(),
    })

    return accountsRedirect(request, 'success', `${handle} connected through Arcade.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete Reddit authorization'
    return accountsRedirect(request, 'error', message)
  }
}
