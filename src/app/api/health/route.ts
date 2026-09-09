import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEALTH_HEADERS = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
}

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json(
      { status: 'ok', database: 'ok' },
      { status: 200, headers: HEALTH_HEADERS }
    )
  } catch {
    // Deliberately do not expose connection strings, database hostnames, or
    // driver error messages from a public operational endpoint.
    return NextResponse.json(
      { status: 'degraded', database: 'unavailable' },
      { status: 503, headers: HEALTH_HEADERS }
    )
  }
}
