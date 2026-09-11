import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { ApiResponse, Platform, PostStatus } from '@/types'
import { PLATFORMS } from '@/types'

const FIVE_MINUTES_MS = 5 * 60 * 1000

const createPostSchema = z.object({
  brandId: z.string().min(1, 'brandId is required'),
  platforms: z
    .array(z.enum(PLATFORMS as [Platform, ...Platform[]]))
    .min(1, 'At least one platform is required'),
  content: z.string().min(1, 'Content is required').max(10000, 'Content too long'),
  mediaUrls: z.array(z.string().url('Each media URL must be a valid URL')).optional().default([]),
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime' })
    .refine(
      (val) => new Date(val).getTime() > Date.now() + FIVE_MINUTES_MS,
      { message: 'scheduledAt must be at least 5 minutes in the future' }
    ),
  notes: z.string().max(1000).optional(),
  title: z.string().max(300).optional(),
  subreddit: z.string().max(100).optional(),
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const status = searchParams.get('status')

  if (!brandId) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'brandId query parameter is required',
    }
    return NextResponse.json(response, { status: 400 })
  }

  const where: Record<string, unknown> = { brandId }
  if (status) where.status = status

  const [total, posts] = await Promise.all([
    db.scheduledPost.count({ where }),
    db.scheduledPost.findMany({
      where,
      include: { brand: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  const response: ApiResponse<ParsedScheduledPost[]> = {
    success: true,
    data: posts.map((post) => parsePost(post)),
    meta: { total, page, limit },
  }

  return NextResponse.json(response)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    const response: ApiResponse<never> = { success: false, error: 'Invalid JSON body' }
    return NextResponse.json(response, { status: 400 })
  }

  const parsed = createPostSchema.safeParse(body)
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    }
    return NextResponse.json(response, { status: 422 })
  }

  const { brandId, platforms, content, mediaUrls, scheduledAt, notes, title, subreddit } = parsed.data

  const brand = await db.brand.findUnique({ where: { id: brandId } })
  if (!brand) {
    const response: ApiResponse<never> = { success: false, error: 'Brand not found' }
    return NextResponse.json(response, { status: 404 })
  }

  const notesValue = [notes, title ? `Title: ${title}` : null, subreddit ? `Subreddit: r/${subreddit}` : null]
    .filter(Boolean)
    .join('\n') || null

  const post = await db.scheduledPost.create({
    data: {
      brandId,
      platforms: JSON.stringify(platforms),
      content,
      mediaUrls: JSON.stringify(mediaUrls),
      scheduledAt: new Date(scheduledAt),
      notes: notesValue,
      status: 'PENDING',
    },
    include: { brand: { select: { name: true } } },
  })

  const response: ApiResponse<ParsedScheduledPost> = {
    success: true,
    data: parsePost(post),
  }

  return NextResponse.json(response, { status: 201 })
}
