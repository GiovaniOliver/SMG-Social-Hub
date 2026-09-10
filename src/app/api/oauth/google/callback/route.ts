import { NextRequest } from 'next/server'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { upsertProviderConnection, upsertSocialAccount } from '@/lib/social-accounts'

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
}

interface GoogleUserInfo {
  sub: string
  name: string
  email?: string
  picture?: string
}

interface YouTubeChannelResponse {
  items: Array<{
    id: string
    snippet: {
      title: string
      description: string
      customUrl?: string
      thumbnails?: {
        default?: { url?: string }
        medium?: { url?: string }
        high?: { url?: string }
      }
    }
  }>
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`)
  return res.json()
}

async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google user discovery failed (${res.status})`)
  return res.json()
}

async function getYouTubeChannel(accessToken: string): Promise<YouTubeChannelResponse> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`YouTube channel discovery failed (${res.status})`)
  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateValue = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (errorParam) {
    return Response.redirect(`${appUrl}/accounts?error=${encodeURIComponent('Google authorization was denied')}`)
  }
  if (!code || !stateValue) {
    return Response.redirect(`${appUrl}/accounts?error=Missing+code+or+state`)
  }

  const state = await verifyOAuthState(stateValue, 'google')
  if (!state) {
    return Response.redirect(`${appUrl}/accounts?error=Invalid+or+expired+OAuth+state`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/accounts?error=Google+OAuth+not+configured`)
  }

  try {
    const tokenData = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
    const userInfo = await getUserInfo(tokenData.access_token)
    const channelData = await getYouTubeChannel(tokenData.access_token)
    const channel = channelData.items[0]
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)
    const scopes = tokenData.scope.split(' ').filter(Boolean)

    const accountId = channel?.id || `google-user:${userInfo.sub}`
    const accountLabel = channel?.snippet.title || userInfo.name || userInfo.email || 'Google Account'
    const connection = await upsertProviderConnection({
      platform: 'YOUTUBE',
      accountId,
      accountLabel,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt,
      scopes,
    })

    const avatarUrl =
      channel?.snippet.thumbnails?.high?.url ||
      channel?.snippet.thumbnails?.medium?.url ||
      channel?.snippet.thumbnails?.default?.url ||
      userInfo.picture ||
      null

    await upsertSocialAccount({
      providerConnectionId: connection.id,
      platform: 'YOUTUBE',
      accountType: channel ? 'CHANNEL' : 'GOOGLE_ACCOUNT',
      externalAccountId: channel?.id || accountId,
      displayName: accountLabel,
      handle: channel?.snippet.customUrl || null,
      profileUrl: channel ? `https://www.youtube.com/channel/${channel.id}` : null,
      avatarUrl,
      publishingCapability: channel && scopes.includes('https://www.googleapis.com/auth/youtube.upload') ? 'AUTOMATIC' : 'READ_ONLY',
      connectionStatus: 'CONNECTED',
      metadata: {
        source: 'google_oauth',
        googleUserId: userInfo.sub,
        googleEmail: userInfo.email || null,
      },
      lastVerifiedAt: new Date(),
    })

    return Response.redirect(
      `${appUrl}/accounts?success=${encodeURIComponent(channel ? `YouTube channel ${accountLabel} connected` : 'Google account connected; no YouTube channel was returned')}`
    )
  } catch (error) {
    console.error('[oauth:google]', error)
    return Response.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent('Google/YouTube connection failed. Check the OAuth configuration and try again.')}`
    )
  }
}
