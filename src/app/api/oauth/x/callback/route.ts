import { NextResponse, type NextRequest } from 'next/server'
import { executeArcadeTool, getArcadeExecutionValue } from '@/lib/arcade'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { upsertProviderConnection, upsertSocialAccount } from '@/lib/social-accounts'

function accountsRedirect(request: NextRequest, key: 'success' | 'error', message: string) {
  const url = new URL('/accounts', request.url)
  url.searchParams.set(key, message)
  return NextResponse.redirect(url)
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function normalizeXIdentity(value: unknown) {
  let raw = value
  if (typeof raw === 'string') {
    const rawString = raw
    try {
      raw = JSON.parse(rawString)
    } catch {
      const username = rawString.replace(/^@/, '').trim()
      return {
        id: null,
        username,
        name: username,
        avatarUrl: null,
      }
    }
  }

  const root = recordOf(raw)
  const data = recordOf(root?.data)
  const user = recordOf(root?.user)
  const profile = recordOf(root?.profile)
  const candidates = [data, user, profile, root]

  const pick = (...keys: string[]) => {
    for (const candidate of candidates) {
      const field = stringField(candidate, ...keys)
      if (field) return field
    }
    return null
  }

  const username = (pick('username', 'handle', 'screen_name') || '').replace(/^@/, '')
  return {
    id: pick('id', 'user_id', 'rest_id'),
    username,
    name: pick('name', 'display_name') || username,
    avatarUrl: pick('profile_image_url', 'profile_image_url_https', 'avatar_url'),
  }
}

export async function GET(request: NextRequest) {
  try {
    const verified = await verifyOAuthState(request.nextUrl.searchParams.get('state'), 'x')
    const arcadeUserId = verified?.subject
    if (!verified || !arcadeUserId || !arcadeUserId.startsWith('smg-social-hub:x:')) {
      return accountsRedirect(request, 'error', 'Invalid or expired X authorization state.')
    }

    const execution = await executeArcadeTool({
      toolName: 'X.WhoAmI',
      userId: arcadeUserId,
    })
    const identity = normalizeXIdentity(getArcadeExecutionValue(execution))

    if (!identity.username) {
      return accountsRedirect(request, 'error', 'X authorization completed, but the account identity could not be read.')
    }

    const handle = `@${identity.username}`
    const connection = await upsertProviderConnection({
      platform: 'TWITTER',
      accountId: arcadeUserId,
      accountLabel: handle,
      accessToken: 'ARCADE_MANAGED',
      scopes: ['tweet.read', 'tweet.write', 'users.read'],
    })

    await upsertSocialAccount({
      providerConnectionId: connection.id,
      platform: 'TWITTER',
      accountType: 'PROFILE',
      externalAccountId: identity.id || `username:${identity.username.toLowerCase()}`,
      displayName: identity.name || identity.username,
      handle,
      profileUrl: `https://x.com/${encodeURIComponent(identity.username)}`,
      avatarUrl: identity.avatarUrl,
      publishingCapability: 'AUTOMATIC',
      connectionStatus: 'CONNECTED',
      metadata: {
        credentialStore: 'arcade',
        arcadeUserId,
        arcadeProvider: 'x',
        identityTool: 'X.WhoAmI',
      },
      lastVerifiedAt: new Date(),
    })

    return accountsRedirect(request, 'success', `${handle} connected through Arcade.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete X authorization'
    return accountsRedirect(request, 'error', message)
  }
}
