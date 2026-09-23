import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const base = process.env.SMG_TRENDS_API_URL?.trim()
  const key = process.env.SMG_TRENDS_API_KEY?.trim()

  if (!base || !key) {
    return NextResponse.json(
      { success: false, error: 'Viral trend feed is not configured yet.' },
      { status: 503 }
    )
  }

  const incoming = new URL(request.url)
  const target = new URL(base)
  for (const keyName of ['window', 'platform', 'limit']) {
    const value = incoming.searchParams.get(keyName)
    if (value) target.searchParams.set(keyName, value)
  }

  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Trend feed unavailable' },
      { status: 502 }
    )
  }
}
