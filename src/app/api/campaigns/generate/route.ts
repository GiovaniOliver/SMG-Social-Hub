import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getBrandById } from '@/lib/brands'
import { generateCampaignContent } from '@/lib/campaigns/generate-campaign'

const schema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  durationDays: z.number().int().min(1).max(60),
  piecesPerDay: z.number().int().min(1).max(5),
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

    const { brandId, name, description, durationDays, piecesPerDay } = parsed.data
    const brand = await getBrandById(brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const { roadmap, pieces } = await generateCampaignContent({ brand, durationDays, piecesPerDay })

    const campaign = await db.transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          brandId,
          name,
          description: description || null,
          status: 'completed',
          analysis: '',
          trends: null,
          metadata: JSON.stringify({ roadmap }),
        },
      })

      await tx.contentPiece.createMany({
        data: pieces.map((p) => ({
          campaignId: created.id,
          brandId,
          day: p.day,
          platform: p.platform,
          format: p.format,
          title: p.title,
          hook: p.hook,
          body: p.body,
          visualPrompt: p.visualPrompt,
          status: p.failed ? 'failed' : 'draft',
        })),
      })

      return tx.campaign.findUniqueOrThrow({
        where: { id: created.id },
        include: { content: { orderBy: { day: 'asc' } } },
      })
    })

    const failedCount = pieces.filter((p) => p.failed).length

    return NextResponse.json({ success: true, data: campaign, failedCount })
  } catch (error) {
    console.error('Campaign generation error:', error)
    const message = error instanceof Error ? error.message : 'Campaign generation failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
