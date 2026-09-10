import { NextRequest } from 'next/server'
import { createOAuthState } from '@/lib/security/oauth-state'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  const clientId = process.env.LINKEDIN_CLIENT_ID
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return Response.json(
      { success: false, error: 'LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI.' },
      { status: 500 }
    )
  }

  const scopes = ['openid', 'profile', 'email', 'w_member_social'].join(' ')
  const state = await createOAuthState(brandId, 'linkedin')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  })

  return Response.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`)
}
