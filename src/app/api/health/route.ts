import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEALTH_HEADERS = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
}

type DatabaseFailureReason =
  | 'AUTHENTICATION_FAILED'
  | 'TENANT_OR_USER_INVALID'
  | 'UNREACHABLE'
  | 'POOLER_MODE_MISMATCH'
  | 'TLS_ERROR'
  | 'CONFIGURATION_INVALID'
  | 'UNKNOWN'

function classifyDatabaseError(error: unknown): DatabaseFailureReason {
  const message = error instanceof Error ? error.message : String(error)

  if (/authentication failed/i.test(message)) return 'AUTHENTICATION_FAILED'
  if (/tenant or user not found|user not found/i.test(message)) return 'TENANT_OR_USER_INVALID'
  if (/can't reach database server|econnrefused|enotfound|timed? out|timeout/i.test(message)) {
    return 'UNREACHABLE'
  }
  if (/prepared statement|pgbouncer/i.test(message)) return 'POOLER_MODE_MISMATCH'
  if (/ssl|tls|certificate/i.test(message)) return 'TLS_ERROR'
  if (/database_url|invalid.*connection|string.*invalid|invalid.*url/i.test(message)) {
    return 'CONFIGURATION_INVALID'
  }

  return 'UNKNOWN'
}

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json(
      { status: 'ok', database: 'ok' },
      { status: 200, headers: HEALTH_HEADERS }
    )
  } catch (error) {
    // Expose only a coarse failure category. Never return the database URL,
    // hostname, username, password, or raw Prisma/driver error message.
    const reason = classifyDatabaseError(error)
    console.error(`[health] database check failed: ${reason}`)

    return NextResponse.json(
      { status: 'degraded', database: 'unavailable', reason },
      { status: 503, headers: HEALTH_HEADERS }
    )
  }
}
