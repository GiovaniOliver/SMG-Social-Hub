import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Paths reachable without a session. Everything else requires the operator login.
// - /login + /api/auth/login: the login surface itself.
// - /api/cron: authenticates itself with CRON_SECRET (called by an external
//   scheduler that has no session cookie), so it's excluded here and guarded
//   inside the route handler.
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/cron'])

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (await verifySessionToken(token)) {
    return NextResponse.next()
  }

  // Unauthenticated: API routes get a JSON 401; page routes redirect to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Run on all routes except Next internals and static image assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
