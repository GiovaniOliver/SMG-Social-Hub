import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { cancelPost } from '@/lib/scheduler'
import type { ApiResponse, Platform, PostStatus } from '@/types'

const FIVE_MINUTES_MS = 5 * 60 * 1000

const updatePostSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  scheduledAt: z
    .string()
    .datetime()
    .refine(
      (val) => new Date(val).getTime() > Date.now() + FIVE_MINUTES_MS,
      { message: 'scheduledAt must be at least 5 minutes in the future' }
    )
    .optional(),
  notes: z.string().max(1000).nullable().optional(),
})

interface ParsedScheduledPost {
  id: string
  brandId: string
  brandName: string
  platforms: Platform[]
  content: string
  mediaUrls: string[]
  scheduledAt: string
  status: PostStatus
  publishedAt: string | null
  error: string | null
  results: Record<string, unknown>
  notes: string | null
  createdAt: string
  updatedAt: string
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return new Date(String(value)).toISOString()
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parsePost(post: Record<string, unknown>): ParsedScheduledPost {
  const brand =
    post.brand && typeof post.brand === 'object'
      ? (post.brand as Record<string, unknown>)
      : {}

  return {
    id: String(post.id ?? ''),
    brandId: String(post.brandId ?? ''),
    brandName: String(brand.name ?? ''),
    platforms: parseJsonArray<Platform>(post.platforms),
    content: String(post.content ?? ''),
    mediaUrls: parseJsonArray<string>(post.mediaUrls),
    scheduledAt: toIso(post.scheduledAt),
    status: String(post.status ?? 'PENDING') as PostStatus,
    publishedAt: post.publishedAt ? toIso(post.publishedAt) : null,
    error: typeof post.error === 'string' ? post.error : null,
    results: parseJsonObject(post.results),
    notes: typeof post.notes === 'string' ? post.notes : null,
    createdAt: toIso(post.createdAt),
    updatedAt: toIso(post.updatedAt),
  }
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params
  const post = await db.scheduledPost.findUnique({
    where: { id },
    include: { brand: { select: { name: true } } },
  })

  if (!post) {
    const response: ApiResponse<never> = { success: false, error: 'Post not found' }
    return NextResponse.json(response, { status: 404 })
  }

  const response: ApiResponse<ParsedScheduledPost> = {
    success: true,
    data: parsePost(post),
  }

  return NextResponse.json(response)
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params
  const post = await db.scheduledPost.findUnique({
    where: { id },
  })

  if (!post) {
    const response: ApiResponse<never> = { success: false, error: 'Post not found' }
    return NextResponse.json(response, { status: 404 })
  }

  if (post.status !== 'PENDING') {
    const response: ApiResponse<never> = {
      success: false,
      error: `Cannot edit post — current status is ${post.status}. Only PENDING posts can be edited.`,
    }
    return NextResponse.json(response, { status: 409 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    const response: ApiResponse<never> = { success: false, error: 'Invalid JSON body' }
    return NextResponse.json(response, { status: 400 })
  }

  const parsed = updatePostSchema.safeParse(body)
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    }
    return NextResponse.json(response, { status: 422 })
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.content !== undefined) updateData.content = parsed.data.content
  if (parsed.data.scheduledAt !== undefined) updateData.scheduledAt = new Date(parsed.data.scheduledAt)
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

  const updated = await db.scheduledPost.update({
    where: { id },
    data: updateData,
    include: { brand: { select: { name: true } } },
  })

  const response: ApiResponse<ParsedScheduledPost> = {
    success: true,
    data: parsePost(updated),
  }

  return NextResponse.json(response)
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params
  try {
    await cancelPost(id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel post'
    const isNotFound = message.includes('not found')

    const response: ApiResponse<never> = { success: false, error: message }
    return NextResponse.json(response, { status: isNotFound ? 404 : 409 })
  }

  const response: ApiResponse<{ id: string; status: string }> = {
    success: true,
    data: { id, status: 'CANCELLED' },
  }

  return NextResponse.json(response)
}
