import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

interface FacebookTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface FacebookLongLivedTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface FacebookPage {
  id: string
  name: string
  access_token: string
}

interface FacebookPagesResponse {
  data: FacebookPage[]
}

async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<FacebookTokenResponse> {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to exchange code: ${error}`)
  }

  return res.json()
}

async function getLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<FacebookLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to get long-lived token: ${error}`)
  }

  return res.json()
}

async function getPages(userToken: string): Promise<FacebookPagesResponse> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch pages: ${error}`)
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

  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI

  if (!appId || !appSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/connect?error=Facebook+OAuth+not+configured`)
  }

  try {
    const shortToken = await exchangeCodeForToken(code, appId, appSecret, redirectUri)
    const longToken = await getLongLivedToken(shortToken.access_token, appId, appSecret)

    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000)
      : null

    const pages = await getPages(longToken.access_token)

    if (pages.data.length === 0) {
      // Store user-level token if no pages
      await prisma.platformConnection.upsert({
        where: { brandId_platform: { brandId, platform: 'FACEBOOK' } },
        create: {
          brandId,
          platform: 'FACEBOOK',
          accountId: null,
          accountLabel: 'User Account',
          accessToken: encrypt(longToken.access_token),
          refreshToken: null,
          expiresAt,
          scopes: JSON.stringify(['pages_manage_posts', 'pages_read_engagement']),
          isActive: true,
        },
        update: {
          accessToken: encrypt(longToken.access_token),
          expiresAt,
          isActive: true,
        },
      })
    } else {
      // Store first page token (primary page)
      const primaryPage = pages.data[0]

      await prisma.platformConnection.upsert({
        where: { brandId_platform: { brandId, platform: 'FACEBOOK' } },
        create: {
          brandId,
          platform: 'FACEBOOK',
          accountId: primaryPage.id,
          accountLabel: primaryPage.name,
          accessToken: encrypt(primaryPage.access_token),
          refreshToken: null,
          expiresAt: null, // Page tokens don't expire if user token is long-lived
          scopes: JSON.stringify(['pages_manage_posts', 'pages_read_engagement']),
          isActive: true,
        },
        update: {
          accountId: primaryPage.id,
          accountLabel: primaryPage.name,
          accessToken: encrypt(primaryPage.access_token),
          expiresAt: null,
          isActive: true,
        },
      })
    }

    return Response.redirect(
      `${appUrl}/connect?success=${encodeURIComponent('Facebook connected successfully')}&brandId=${brandId}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook OAuth failed'
    return Response.redirect(
      `${appUrl}/connect?error=${encodeURIComponent(message)}&brandId=${brandId}`
    )
  }
}
