import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scanCommentsForBrand } from '@/lib/comments'
import type { ApiResponse } from '@/types'

const ScanBodySchema = z.object({
  brandId: z.string().min(1),
  platforms: z.array(z.string()).optional(),
  additionalUrls: z
    .array(
      z.object({
        platform: z.string().min(1),
        // Accepts a full post URL *or* a raw identifier (LinkedIn URN,
        // TikTok video id), so this is validated as non-empty rather than a URL.
        url: z.string().min(1),
        relevanceNote: z.string().optional(),
      })
    )
    .optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = ScanBodySchema.safeParse(body)

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      }
      return NextResponse.json(response, { status: 400 })
    }

    const result = await scanCommentsForBrand(parsed.data)

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    }
    return NextResponse.json(response)
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Scan failed',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
