import { NextRequest } from 'next/server'
import { createOAuthState } from '@/lib/security/oauth-state'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  const appId = process.env.FACEBOOK_APP_ID
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI

  if (!appId || !redirectUri) {
    return Response.json(
      { success: false, error: 'Facebook OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI.' },
      { status: 500 }
    )
  }

  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'business_management',
  ].join(',')

  const state = await createOAuthState(brandId, 'facebook')
  const graphVersion = process.env.META_GRAPH_VERSION || 'v26.0'

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  })

  return Response.redirect(`https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`)
}
