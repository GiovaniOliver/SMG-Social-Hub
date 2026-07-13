import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

interface LinkedInTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope: string
}

interface LinkedInProfileResponse {
  sub: string
  name: string
  given_name: string
  family_name: string
  email?: string
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to exchange code: ${error}`)
  }

  return res.json()
}

async function getProfile(accessToken: string): Promise<LinkedInProfileResponse> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch LinkedIn profile: ${error}`)
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

  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/connect?error=LinkedIn+OAuth+not+configured`)
  }

  try {
    const tokenData = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
    const profile = await getProfile(tokenData.access_token)

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    await prisma.platformConnection.upsert({
      where: { brandId_platform: { brandId, platform: 'LINKEDIN' } },
      create: {
        brandId,
        platform: 'LINKEDIN',
        accountId: profile.sub,
        accountLabel: profile.name ?? profile.email ?? 'LinkedIn Account',
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: JSON.stringify(tokenData.scope.split(' ')),
        isActive: true,
      },
      update: {
        accountId: profile.sub,
        accountLabel: profile.name ?? profile.email ?? 'LinkedIn Account',
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: JSON.stringify(tokenData.scope.split(' ')),
        isActive: true,
      },
    })

    return Response.redirect(
      `${appUrl}/connect?success=${encodeURIComponent('LinkedIn connected successfully')}&brandId=${brandId}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LinkedIn OAuth failed'
    return Response.redirect(
      `${appUrl}/connect?error=${encodeURIComponent(message)}&brandId=${brandId}`
    )
  }
}
