import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
  id_token?: string
}

interface GoogleUserInfo {
  sub: string
  name: string
  given_name: string
  family_name: string
  email: string
  picture: string
}

interface YouTubeChannelResponse {
  items: Array<{
    id: string
    snippet: {
      title: string
      description: string
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
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Google token exchange failed: ${error}`)
  }

  return res.json()
}

async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Google user info: ${error}`)
  }

  return res.json()
}

async function getYouTubeChannel(accessToken: string): Promise<YouTubeChannelResponse> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch YouTube channel: ${error}`)
  }

  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (errorParam) {
    return Response.redirect(
      `${appUrl}/connect?error=${encodeURIComponent('Google OAuth was denied')}`
    )
  }

  if (!code || !state) {
    return Response.redirect(`${appUrl}/connect?error=Missing+code+or+state`)
  }

  let brandId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    brandId = decoded.brandId
    if (!brandId) throw new Error('No brandId in state')
  } catch {
    return Response.redirect(`${appUrl}/connect?error=Invalid+state+parameter`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/connect?error=Google+OAuth+not+configured`)
  }

  try {
    const tokenData = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
    const userInfo = await getUserInfo(tokenData.access_token)

    let channelTitle = userInfo.name
    let channelId = userInfo.sub

    try {
      const channelData = await getYouTubeChannel(tokenData.access_token)
      if (channelData.items.length > 0) {
        channelTitle = channelData.items[0].snippet.title
        channelId = channelData.items[0].id
      }
    } catch {
      // YouTube channel fetch is optional — fall back to Google account name
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    await prisma.platformConnection.upsert({
      where: { brandId_platform: { brandId, platform: 'YOUTUBE' } },
      create: {
        brandId,
        platform: 'YOUTUBE',
        accountId: channelId,
        accountLabel: channelTitle,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: JSON.stringify(tokenData.scope.split(' ')),
        isActive: true,
      },
      update: {
        accountId: channelId,
        accountLabel: channelTitle,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: JSON.stringify(tokenData.scope.split(' ')),
        isActive: true,
      },
    })

    return Response.redirect(
      `${appUrl}/connect?success=${encodeURIComponent('YouTube connected successfully')}&brandId=${brandId}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google OAuth failed'
    return Response.redirect(
      `${appUrl}/connect?error=${encodeURIComponent(message)}&brandId=${brandId}`
    )
  }
}
