import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateContent, type GeneratedPost } from '@/lib/ai/content-generator'
import { CONTENT_TYPES } from '@/lib/ai/content-types'
import type { ContentType } from '@/lib/ai/content-types'
import { getBrandById } from '@/lib/brands'
import { generateImage, generateVideo } from '@/lib/ai/media-providers'
import { buildVisualPrompt } from '@/lib/ai/visual-prompt'
import { prisma } from '@/lib/db'
import type { Platform } from '@/types'
import { PLATFORMS } from '@/types'

const schema = z.object({
  brandId: z.string().min(1),
  platforms: z.array(z.enum(PLATFORMS as [Platform, ...Platform[]])).min(1),
  contentType: z.enum(Object.keys(CONTENT_TYPES) as [ContentType, ...ContentType[]]),
  topic: z.string().max(500).optional().default(''),
  generateImage: z.boolean().optional().default(false),
  generateVideo: z.boolean().optional().default(false),
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

    const {
      brandId,
      platforms,
      contentType,
      topic,
      generateImage: wantImage,
      generateVideo: wantVideo,
    } = parsed.data

    if (wantImage && wantVideo) {
      return NextResponse.json(
        { success: false, error: 'Choose either generateImage or generateVideo, not both.' },
        { status: 400 }
      )
    }

    const brand = await getBrandById(brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const { voice, context } = brand
    const results = await generateContent(platforms, brand.name, voice, context, contentType, topic)

    let mediaUrl: string | undefined
    let visualPromptText: string | undefined
    let mediaWarning: string | undefined

    if (wantImage || wantVideo) {
      const firstOk = results.find((r) => r.content)
      if (firstOk) {
        try {
          visualPromptText = await buildVisualPrompt({
            mediaType: wantVideo ? 'video' : 'image',
            brandName: brand.name,
            brandVoice: voice,
            brandContext: context,
            postContent: firstOk.content,
            postHook: firstOk.hook,
          })
          const media = wantVideo ? await generateVideo(visualPromptText) : await generateImage(visualPromptText)
          mediaUrl = media.url
        } catch (err) {
          mediaWarning = err instanceof Error ? err.message : 'Media generation failed'
        }
      }
    }

    const withMedia: GeneratedPost[] = results.map((r) => {
      if (!r.content || !mediaUrl) return r
      return wantVideo ? { ...r, videoUrl: mediaUrl } : { ...r, imageUrl: mediaUrl }
    })

    const finalResults: GeneratedPost[] = mediaWarning
      ? withMedia.map((r) => (r.content ? { ...r, mediaWarning } : r))
      : withMedia

    const successful = finalResults.filter((r) => r.content)
    if (successful.length > 0) {
      try {
        await prisma.generatedContent.createMany({
          data: successful.map((r) => ({
            brandId,
            platform: r.platform,
            contentType,
            topic: topic || null,
            content: r.content,
            hook: r.hook,
            tip: r.tip ?? null,
            imageUrl: r.imageUrl ?? null,
            videoUrl: r.videoUrl ?? null,
            visualPrompt: visualPromptText ?? null,
          })),
        })
      } catch (persistError) {
        // Don't let a persistence failure discard content that was already
        // successfully (and, for media, expensively) generated.
        console.error('Failed to persist generated content:', persistError)
      }
    }

    return NextResponse.json({ success: true, data: finalResults })
  } catch (error) {
    console.error('Content generation error:', error)
    return NextResponse.json(
      { success: false, error: 'Content generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
