import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import type { ApiResponse } from '@/types'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const CreateBodySchema = z.object({
  brandId: z.string().min(1),
  platform: z.string().min(1),
  postUrl: z.string().url(),
  postContent: z.string().optional(),
  commentText: z.string().optional(),
  authorName: z.string().optional(),
  relevanceNote: z.string().optional(),
  isOwned: z.boolean().optional(),
})

function buildPostLevelDedupeKey(brandId: string, postUrl: string): string {
  return createHash('sha256')
    .update(`${brandId}\u0000${postUrl}\u0000post-level`)
    .digest('hex')
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl

    const brandId = searchParams.get('brandId')
    if (!brandId) {
      const response: ApiResponse<never> = { success: false, error: 'brandId is required' }
      return NextResponse.json(response, { status: 400 })
    }

    const status = searchParams.get('status') ?? undefined
    const platform = searchParams.get('platform') ?? undefined
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10))
    )

    const where: Record<string, unknown> = { brandId }
    if (status) where.status = status.toUpperCase()
    if (platform) where.platform = platform.toUpperCase()

    const [total, opportunities] = await Promise.all([
      prisma.commentOpportunity.count({ where }),
      prisma.commentOpportunity.findMany({
        where,
        include: { drafts: { orderBy: { createdAt: 'desc' } } },
        orderBy: { discoveredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const response: ApiResponse<typeof opportunities> = {
      success: true,
      data: opportunities,
      meta: { total, page, limit },
    }
    return NextResponse.json(response)
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch opportunities',
    }
    return NextResponse.json(response, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = CreateBodySchema.safeParse(body)

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      }
      return NextResponse.json(response, { status: 400 })
    }

    const {
      brandId,
      platform,
      postUrl,
      postContent,
      commentText,
      authorName,
      relevanceNote,
      isOwned,
    } = parsed.data

    const opportunity = await prisma.commentOpportunity.create({
      data: {
        dedupeKey: buildPostLevelDedupeKey(brandId, postUrl),
        brandId,
        platform: platform.toUpperCase(),
        postUrl,
        postContent: postContent ?? null,
        commentText: commentText ?? null,
        authorName: authorName ?? null,
        relevanceNote: relevanceNote ?? null,
        isOwned: isOwned ?? false,
        status: 'PENDING',
      },
      include: { drafts: true },
    })

    const response: ApiResponse<typeof opportunity> = {
      success: true,
      data: opportunity,
    }
    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'This comment opportunity already exists',
      }
      return NextResponse.json(response, { status: 409 })
    }

    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create opportunity',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
