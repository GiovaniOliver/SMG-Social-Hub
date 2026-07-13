import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateContent } from '@/lib/ai/content-generator'
import { CONTENT_TYPES } from '@/lib/ai/content-types'
import type { ContentType } from '@/lib/ai/content-types'
import { getBrandById } from '@/lib/brands'
import type { Platform } from '@/types'
import { PLATFORMS } from '@/types'

const schema = z.object({
  brandId: z.string().min(1),
  platforms: z.array(z.enum(PLATFORMS as [Platform, ...Platform[]])).min(1),
  contentType: z.enum(Object.keys(CONTENT_TYPES) as [ContentType, ...ContentType[]]),
  topic: z.string().max(500).optional().default(''),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const { brandId, platforms, contentType, topic } = parsed.data

    const brand = await getBrandById(brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const { voice, context } = brand

    const results = await generateContent(platforms, brand.name, voice, context, contentType, topic)

    return NextResponse.json({ success: true, data: results })
  } catch (error) {
    console.error('Content generation error:', error)
    return NextResponse.json(
      { success: false, error: 'Content generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
