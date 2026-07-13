import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

interface TikTokTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
  open_id: string
  scope: string
  token_type: string
}

interface TikTokUserInfo {
  data: {
    user: {
      open_id: string
      display_name: string
      avatar_url: string
    }
  }
  error: {
    code: string
    message: string
  }
}

async function exchangeCodeForToken(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`TikTok token exchange failed: ${error}`)
  }

  return res.json()
}

async function getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const res = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch TikTok user info: ${error}`)
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
    const desc = searchParams.get('error_description') ?? 'OAuth was denied'
    return Response.redirect(`${appUrl}/connect?error=${encodeURIComponent(desc)}`)
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

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const redirectUri = process.env.TIKTOK_REDIRECT_URI

  if (!clientKey || !clientSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/connect?error=TikTok+OAuth+not+configured`)
  }

  try {
    const tokenData = await exchangeCodeForToken(code, clientKey, clientSecret, redirectUri)
    const userInfo = await getUserInfo(tokenData.access_token)

    const displayName = userInfo.data?.user?.display_name ?? 'TikTok Account'
    const openId = tokenData.open_id

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    await prisma.platformConnection.upsert({
      where: { brandId_platform: { brandId, platform: 'TIKTOK' } },
      create: {
        brandId,
        platform: 'TIKTOK',
        accountId: openId,
        accountLabel: displayName,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        expiresAt,
        scopes: JSON.stringify(tokenData.scope.split(',')),
        isActive: true,
      },
      update: {
        accountId: openId,
        accountLabel: displayName,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        expiresAt,
        scopes: JSON.stringify(tokenData.scope.split(',')),
        isActive: true,
      },
    })

    return Response.redirect(
      `${appUrl}/connect?success=${encodeURIComponent('TikTok connected successfully')}&brandId=${brandId}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TikTok OAuth failed'
    return Response.redirect(
      `${appUrl}/connect?error=${encodeURIComponent(message)}&brandId=${brandId}`
    )
  }
}
