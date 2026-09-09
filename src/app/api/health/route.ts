import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEALTH_HEADERS = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
}

const EXPECTED_SUPABASE_PROJECT_REF = 'kicfnilhwenaditbgcxh'

type DatabaseFailureReason =
  | 'AUTHENTICATION_FAILED'
  | 'POOLER_USERNAME_INVALID'
  | 'TENANT_OR_USER_INVALID'
  | 'UNREACHABLE'
  | 'POOLER_MODE_MISMATCH'
  | 'TLS_ERROR'
  | 'CONFIGURATION_INVALID'
  | 'UNKNOWN'

type SafeDatabaseConfig = {
  present: boolean
  provider: 'supabase-pooler' | 'supabase-direct' | 'other' | 'invalid'
  port: string | null
  usernameFormat: 'tenant-qualified' | 'plain-postgres' | 'other' | 'missing'
  projectRefMatch: boolean | null
  transactionPort: boolean | null
  pgbouncerParam: boolean
  connectionLimitOne: boolean
}

function inspectDatabaseConfig(): SafeDatabaseConfig {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    return {
      present: false,
      provider: 'invalid',
      port: null,
      usernameFormat: 'missing',
      projectRefMatch: null,
      transactionPort: null,
      pgbouncerParam: false,
      connectionLimitOne: false,
    }
  }

  try {
    const url = new URL(raw)
    const hostname = url.hostname.toLowerCase()
    const username = decodeURIComponent(url.username)
    const isPooler = hostname.endsWith('.pooler.supabase.com')
    const isDirect = hostname === `db.${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`
    const usernameFormat = username.startsWith('postgres.')
      ? 'tenant-qualified'
      : username === 'postgres'
        ? 'plain-postgres'
        : username
          ? 'other'
          : 'missing'

    const projectRefMatch =
      usernameFormat === 'tenant-qualified'
        ? username === `postgres.${EXPECTED_SUPABASE_PROJECT_REF}`
        : null

    return {
      present: true,
      provider: isPooler ? 'supabase-pooler' : isDirect ? 'supabase-direct' : 'other',
      port: url.port || null,
      usernameFormat,
      projectRefMatch,
      transactionPort: isPooler ? url.port === '6543' : null,
      pgbouncerParam: url.searchParams.get('pgbouncer') === 'true',
      connectionLimitOne: url.searchParams.get('connection_limit') === '1',
    }
  } catch {
    return {
      present: true,
      provider: 'invalid',
      port: null,
      usernameFormat: 'missing',
      projectRefMatch: null,
      transactionPort: null,
      pgbouncerParam: false,
      connectionLimitOne: false,
    }
  }
}

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
    const config = inspectDatabaseConfig()
    let reason = classifyDatabaseError(error)

    if (reason === 'AUTHENTICATION_FAILED' && config.provider === 'supabase-pooler') {
      if (config.usernameFormat === 'plain-postgres') {
        reason = 'POOLER_USERNAME_INVALID'
      } else if (config.usernameFormat === 'tenant-qualified' && config.projectRefMatch === false) {
        reason = 'TENANT_OR_USER_INVALID'
      }
    }

    // Safe operational diagnostics only. Never log the database URL, hostname,
    // full username, password, or raw Prisma/driver error message.
    console.error(`[health] database check failed: ${reason}; config=${JSON.stringify(config)}`)

    return NextResponse.json(
      { status: 'degraded', database: 'unavailable', reason },
      { status: 503, headers: HEALTH_HEADERS }
    )
  }
}
