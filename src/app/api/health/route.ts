import { NextResponse } from 'next/server'
import { databaseHealthCheck } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEALTH_HEADERS = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
}

type DatabaseFailureReason =
  | 'AUTHENTICATION_FAILED'
  | 'CONFIGURATION_INVALID'
  | 'UNREACHABLE'
  | 'UNKNOWN'

function classifyDatabaseError(error: unknown): DatabaseFailureReason {
  const message = error instanceof Error ? error.message : String(error)

  if (/invalid api key|jwt|unauthorized|authentication|permission denied/i.test(message)) {
    return 'AUTHENTICATION_FAILED'
  }
  if (/SUPABASE_URL|SUPABASE_SECRET_KEY|invalid url/i.test(message)) {
    return 'CONFIGURATION_INVALID'
  }
  if (/fetch failed|econnrefused|enotfound|timed? out|timeout/i.test(message)) {
    return 'UNREACHABLE'
  }

  return 'UNKNOWN'
}

export async function GET(): Promise<NextResponse> {
  try {
    await databaseHealthCheck()

    return NextResponse.json(
      { status: 'ok', database: 'ok' },
      { status: 200, headers: HEALTH_HEADERS }
    )
  } catch (error) {
    const reason = classifyDatabaseError(error)
    console.error(`[health] database check failed: ${reason}`)

    return NextResponse.json(
      { status: 'degraded', database: 'unavailable', reason },
      { status: 503, headers: HEALTH_HEADERS }
    )
  }
}
