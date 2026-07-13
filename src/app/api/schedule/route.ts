import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
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

function parsePost(
  post: {
    id: string
    brandId: string
    platforms: string
    content: string
    mediaUrls: string
    scheduledAt: Date
    status: string
    publishedAt: Date | null
    error: string | null
    results: string
    notes: string | null
    createdAt: Date
    updatedAt: Date
    brand: { name: string }
  }
): ParsedScheduledPost {
  let platforms: Platform[] = []
  try {
    platforms = JSON.parse(post.platforms)
  } catch {
    platforms = []
  }

  let mediaUrls: string[] = []
  try {
    mediaUrls = JSON.parse(post.mediaUrls)
  } catch {
    mediaUrls = []
  }

  let results: Record<string, unknown> = {}
  try {
    results = JSON.parse(post.results)
  } catch {
    results = {}
  }

  return {
    id: post.id,
    brandId: post.brandId,
    brandName: post.brand.name,
    platforms,
    content: post.content,
    mediaUrls,
    scheduledAt: post.scheduledAt.toISOString(),
    status: post.status as PostStatus,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    error: post.error,
    results,
    notes: post.notes,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
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
  if (status) {
    where.status = status
  }

  const [total, posts] = await Promise.all([
    prisma.scheduledPost.count({ where }),
    prisma.scheduledPost.findMany({
      where,
      include: { brand: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  const response: ApiResponse<ParsedScheduledPost[]> = {
    success: true,
    data: posts.map(parsePost),
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

  const { brandId, platforms, content, mediaUrls, scheduledAt, notes, title, subreddit } =
    parsed.data

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) {
    const response: ApiResponse<never> = { success: false, error: 'Brand not found' }
    return NextResponse.json(response, { status: 404 })
  }

  const notesValue = [notes, title ? `Title: ${title}` : null, subreddit ? `Subreddit: r/${subreddit}` : null]
    .filter(Boolean)
    .join('\n') || null

  const post = await prisma.scheduledPost.create({
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
