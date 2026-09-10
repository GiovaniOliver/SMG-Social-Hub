import { NextRequest } from 'next/server'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { upsertProviderConnection, upsertSocialAccount } from '@/lib/social-accounts'

interface LinkedInTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
}

interface LinkedInProfileResponse {
  sub: string
  name: string
  given_name?: string
  family_name?: string
  email?: string
  picture?: string
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
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`LinkedIn token exchange failed (${res.status})`)
  return res.json()
}

async function getProfile(accessToken: string): Promise<LinkedInProfileResponse> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`LinkedIn profile discovery failed (${res.status})`)
  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateValue = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (errorParam) {
    const desc = searchParams.get('error_description') ?? 'LinkedIn authorization was denied'
    return Response.redirect(`${appUrl}/accounts?error=${encodeURIComponent(desc)}`)
  }
  if (!code || !stateValue) {
    return Response.redirect(`${appUrl}/accounts?error=Missing+code+or+state`)
  }

  const state = await verifyOAuthState(stateValue, 'linkedin')
  if (!state) {
    return Response.redirect(`${appUrl}/accounts?error=Invalid+or+expired+OAuth+state`)
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/accounts?error=LinkedIn+OAuth+not+configured`)
  }

  try {
    const tokenData = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
    const profile = await getProfile(tokenData.access_token)
    const scopes = tokenData.scope.split(' ').filter(Boolean)
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)
    const label = profile.name || profile.email || 'LinkedIn Account'

    const connection = await upsertProviderConnection({
      platform: 'LINKEDIN',
      accountId: profile.sub,
      accountLabel: label,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt,
      scopes,
    })

    await upsertSocialAccount({
      providerConnectionId: connection.id,
      platform: 'LINKEDIN',
      accountType: 'MEMBER',
      externalAccountId: profile.sub,
      displayName: label,
      avatarUrl: profile.picture || null,
      publishingCapability: scopes.includes('w_member_social') ? 'AUTOMATIC' : 'READ_ONLY',
      connectionStatus: 'CONNECTED',
      metadata: { source: 'linkedin_oauth', email: profile.email || null },
      lastVerifiedAt: new Date(),
    })

    return Response.redirect(
      `${appUrl}/accounts?success=${encodeURIComponent(`LinkedIn account ${label} connected`)}`
    )
  } catch (error) {
    console.error('[oauth:linkedin]', error)
    return Response.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent('LinkedIn connection failed. Check the OAuth configuration and try again.')}`
    )
  }
}
