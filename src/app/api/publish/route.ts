import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { publishPost } from '@/lib/social'
import { prisma } from '@/lib/db'

const publishBodySchema = z.object({
  brandId: z.string().min(1, 'brandId is required'),
  platforms: z.array(z.string().min(1)).min(1, 'At least one platform is required'),
  content: z.string().min(1, 'content is required'),
  mediaUrls: z.array(z.string().url()).optional(),
  title: z.string().optional(),
  subreddit: z.string().optional(),
  scheduledPostId: z.string().optional(),
  userId: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const parsed = publishBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body.',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    )
  }

  const { brandId, platforms, content, mediaUrls, title, subreddit, scheduledPostId, userId } =
    parsed.data

  // Verify brand exists
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) {
    return NextResponse.json(
      { success: false, error: `Brand "${brandId}" not found.` },
      { status: 404 },
    )
  }

  // If a scheduledPostId was provided, mark it as publishing
  if (scheduledPostId) {
    await prisma.scheduledPost.updateMany({
      where: { id: scheduledPostId, brandId },
      data: { status: 'PUBLISHING' },
    })
  }

  const results = await publishPost({
    brandId,
    platforms,
    content,
    mediaUrls,
    title,
    subreddit,
    userId,
  })

  // If linked to a scheduled post, persist results and final status
  if (scheduledPostId) {
    const allSucceeded = Object.values(results).every((r) => r.success)
    const anySucceeded = Object.values(results).some((r) => r.success)

    const finalStatus = allSucceeded ? 'PUBLISHED' : anySucceeded ? 'PUBLISHED' : 'FAILED'

    const failedPlatforms = Object.entries(results)
      .filter(([, r]) => !r.success)
      .map(([platform, r]) => `${platform}: ${r.error ?? 'Unknown error'}`)

    await prisma.scheduledPost.updateMany({
      where: { id: scheduledPostId, brandId },
      data: {
        status: finalStatus,
        publishedAt: anySucceeded ? new Date() : null,
        error: failedPlatforms.length > 0 ? failedPlatforms.join(' | ') : null,
        results: JSON.stringify(results),
      },
    })
  }

  const overallSuccess = Object.values(results).some((r) => r.success)

  return NextResponse.json(
    {
      success: overallSuccess,
      results,
    },
    { status: overallSuccess ? 200 : 207 },
  )
}
