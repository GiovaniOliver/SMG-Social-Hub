import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processScheduledPosts } from '@/lib/scheduler'
import type { ApiResponse } from '@/types'

interface RetryResult {
  postId: string
  status: string
  platformResults: Record<string, unknown>
  error?: string
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(
  _request: NextRequest,
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

  if (post.status !== 'FAILED') {
    const response: ApiResponse<never> = {
      success: false,
      error: `Cannot retry post — current status is ${post.status}. Only FAILED posts can be retried.`,
    }
    return NextResponse.json(response, { status: 409 })
  }

  await db.scheduledPost.update({
    where: { id: id },
    data: {
      status: 'PENDING',
      scheduledAt: new Date(),
      error: null,
    },
  })

  const results = await processScheduledPosts()
  const postResult = results.find((r) => r.postId === id)

  if (!postResult) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Post was reset but scheduler did not process it. Please try again.',
    }
    return NextResponse.json(response, { status: 500 })
  }

  const response: ApiResponse<RetryResult> = {
    success: true,
    data: {
      postId: postResult.postId,
      status: postResult.status,
      platformResults: postResult.platformResults,
      error: postResult.error,
    },
  }

  return NextResponse.json(response)
}
