import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSessionToken,
  isAuthConfigured,
  verifyPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth'
import type { ApiResponse } from '@/types'

const BodySchema = z.object({ password: z.string().min(1) })

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthConfigured()) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Auth is not configured. Set AUTH_SECRET and APP_PASSWORD in the environment.',
    }
    return NextResponse.json(response, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    const response: ApiResponse<never> = { success: false, error: 'Password is required' }
    return NextResponse.json(response, { status: 400 })
  }

  if (!verifyPassword(parsed.data.password)) {
    const response: ApiResponse<never> = { success: false, error: 'Incorrect password' }
    return NextResponse.json(response, { status: 401 })
  }

  const token = await createSessionToken()
  const response: ApiResponse<never> = { success: true }
  const res = NextResponse.json(response)
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return res
}
