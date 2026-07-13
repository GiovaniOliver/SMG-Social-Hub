import { NextRequest, NextResponse } from 'next/server'
import { processScheduledPosts } from '@/lib/scheduler'
import type { ApiResponse } from '@/types'

interface CronResult {
  processed: number
  results: Array<{
    postId: string
    status: string
    platformResults: Record<string, unknown>
    error?: string
  }>
}

// This endpoint is excluded from the session middleware because it's called by
// an external scheduler (e.g. Vercel Cron) with no session cookie. It guards
// itself with a shared secret instead: callers must send the CRON_SECRET either
// as `Authorization: Bearer <secret>` or `?secret=<secret>`.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed: unconfigured secret means no access

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true

  return request.nextUrl.searchParams.get('secret') === secret
}

async function runScheduler(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    const response: ApiResponse<never> = { success: false, error: 'Unauthorized' }
    return NextResponse.json(response, { status: 401 })
  }

  const results = await processScheduledPosts()

  const response: ApiResponse<CronResult> = {
    success: true,
    data: {
      processed: results.length,
      results,
    },
  }

  return NextResponse.json(response)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return runScheduler(request)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runScheduler(request)
}
