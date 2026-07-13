import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')

  if (!brandId) {
    return Response.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const redirectUri = process.env.TIKTOK_REDIRECT_URI

  if (!clientKey || !redirectUri) {
    return Response.json(
      { success: false, error: 'TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI.' },
      { status: 500 }
    )
  }

  const scopes = [
    'user.info.basic',
    'video.publish',
    'video.upload',
  ].join(',')

  const codeVerifier = randomBytes(32).toString('base64url')
  const state = Buffer.from(
    JSON.stringify({ brandId, codeVerifier, ts: Date.now() })
  ).toString('base64url')

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: scopes,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  })

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`

  return Response.redirect(authUrl)
}
