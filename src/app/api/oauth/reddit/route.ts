import { NextResponse, type NextRequest } from 'next/server'
import { startArcadeProviderAuthorization } from '@/lib/arcade'
import { createOAuthState } from '@/lib/security/oauth-state'

function appOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL
  return (configured || request.nextUrl.origin).replace(/\/$/, '')
}

function accountsError(request: NextRequest, message: string): NextResponse {
  const url = new URL('/accounts', request.url)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  try {
    const arcadeUserId = `smg-social-hub:reddit:${crypto.randomUUID()}`
    const state = await createOAuthState(null, 'reddit', arcadeUserId)
    const callbackUrl = new URL('/api/oauth/reddit/callback', appOrigin(request))
    callbackUrl.searchParams.set('state', state)

    const authorization = await startArcadeProviderAuthorization({
      userId: arcadeUserId,
      provider: 'reddit',
      scopes: ['identity', 'read', 'submit'],
      nextUri: callbackUrl.toString(),
    })

    if (authorization.status === 'completed') {
      return NextResponse.redirect(callbackUrl)
    }

    if (!authorization.url) {
      return accountsError(request, 'Arcade did not return a Reddit authorization URL.')
    }

    return NextResponse.redirect(authorization.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Reddit authorization'
    return accountsError(request, message)
  }
}
