import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import type { ApiResponse } from '@/types'

export async function POST(): Promise<NextResponse> {
  const response: ApiResponse<never> = { success: true }
  const res = NextResponse.json(response)
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
