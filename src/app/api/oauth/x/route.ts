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
    const arcadeUserId = `smg-social-hub:x:${crypto.randomUUID()}`
    const state = await createOAuthState(null, 'x', arcadeUserId)
    const callbackUrl = new URL('/api/oauth/x/callback', appOrigin(request))
    callbackUrl.searchParams.set('state', state)

    const authorization = await startArcadeProviderAuthorization({
      userId: arcadeUserId,
      provider: 'x',
      scopes: ['tweet.read', 'tweet.write', 'users.read'],
      nextUri: callbackUrl.toString(),
    })

    if (authorization.status === 'completed') {
      return NextResponse.redirect(callbackUrl)
    }

    if (!authorization.url) {
      return accountsError(request, 'Arcade did not return an X authorization URL.')
    }

    return NextResponse.redirect(authorization.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start X authorization'
    return accountsError(request, message)
  }
}
