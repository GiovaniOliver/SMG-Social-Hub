import { db } from '@/lib/db'
import { publishPost } from '@/lib/social/index'
import type { PostStatus } from '@/types'

interface PlatformResult {
  success: boolean
  postId?: string
  postUrl?: string
  error?: string
  requiresAuth?: boolean
}

export interface ProcessedPostResult {
  postId: string
  status: PostStatus
  platformResults: Record<string, PlatformResult>
  error?: string
}

const STALE_PUBLISHING_AFTER_MS = 15 * 60 * 1000

function parsePlatforms(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseMediaUrls(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function processScheduledPosts(): Promise<ProcessedPostResult[]> {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_PUBLISHING_AFTER_MS)

  // Recover posts that were claimed by an invocation that died before finishing.
  await db.scheduledPost.updateMany({
    where: {
      status: 'PUBLISHING',
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: 'PENDING',
      error: 'Recovered stale publishing claim; retrying',
    },
  })

  const pendingPosts = await db.scheduledPost.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
  })

  const results: ProcessedPostResult[] = []

  for (const post of pendingPosts) {
    // Atomically claim this post. Concurrent scheduler invocations can both see
    // the row in findMany(), but only one can transition it from PENDING.
    const claim = await db.scheduledPost.updateMany({
      where: { id: post.id, status: 'PENDING' },
      data: { status: 'PUBLISHING', error: null },
    })

    if (claim.count !== 1) continue

    const platforms = parsePlatforms(post.platforms)
    const mediaUrls = parseMediaUrls(post.mediaUrls)

    let platformResults: Record<string, PlatformResult> = {}

    try {
      platformResults = await publishPost({
        brandId: post.brandId,
        platforms,
        content: post.content,
        mediaUrls,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected publishing error'

      await db.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'FAILED', error: errorMessage, results: '{}' },
      })

      results.push({
        postId: post.id,
        status: 'FAILED',
        platformResults: {},
        error: errorMessage,
      })

      continue
    }

    const allFailed =
      platforms.length === 0 ||
      Object.values(platformResults).every((r) => !r.success)

    const anySuccess = Object.values(platformResults).some((r) => r.success)

    const finalStatus: PostStatus = allFailed ? 'FAILED' : 'PUBLISHED'

    const errorMessage = allFailed
      ? Object.values(platformResults)
          .map((r) => r.error)
          .filter(Boolean)
          .join('; ') || 'All platforms failed'
      : undefined

    await db.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: finalStatus,
        publishedAt: anySuccess ? new Date() : null,
        results: JSON.stringify(platformResults),
        error: errorMessage ?? null,
      },
    })

    results.push({
      postId: post.id,
      status: finalStatus,
      platformResults,
      error: errorMessage,
    })
  }

  return results
}

export async function cancelPost(postId: string): Promise<void> {
  const post = await db.scheduledPost.findUnique({
    where: { id: postId },
  })

  if (!post) {
    throw new Error(`Post ${postId} not found`)
  }

  if (post.status !== 'PENDING') {
    throw new Error(
      `Cannot cancel post ${postId} — current status is ${post.status}. Only PENDING posts can be cancelled.`
    )
  }

  await db.scheduledPost.update({
    where: { id: postId },
    data: { status: 'CANCELLED' },
  })
}
