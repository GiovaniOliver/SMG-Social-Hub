import { NextRequest } from 'next/server'
import { createOAuthState } from '@/lib/security/oauth-state'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const redirectUri = process.env.TIKTOK_REDIRECT_URI

  if (!clientKey || !redirectUri) {
    return Response.json(
      { success: false, error: 'TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI.' },
      { status: 500 }
    )
  }

  const scopes = ['user.info.basic', 'video.publish', 'video.upload'].join(',')
  const state = await createOAuthState(brandId, 'tiktok')

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: scopes,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  })

  return Response.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`)
}
