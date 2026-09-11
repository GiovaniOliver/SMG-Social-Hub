import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBrandById } from '@/lib/brands'
import { generateText } from '@/lib/ai/providers'
import {
  buildHydratePrompt,
  parseHydrateResponse,
  isPlatform,
  isContentFormat,
  type SkeletonPiece,
} from '@/lib/campaigns/prompts'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const piece = await db.contentPiece.findUnique({ where: { id } })
    if (!piece) {
      return NextResponse.json({ success: false, error: 'Content piece not found' }, { status: 404 })
    }

    if (!isPlatform(piece.platform) || !isContentFormat(piece.format)) {
      return NextResponse.json(
        { success: false, error: `Cannot regenerate: unrecognized platform/format on this piece (${piece.platform}/${piece.format}). Edit it manually first.` },
        { status: 422 }
      )
    }

    const brand = await getBrandById(piece.brandId)
    if (!brand) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const skeletonPiece: SkeletonPiece = {
      day: piece.day,
      platform: piece.platform,
      format: piece.format,
      title: piece.title,
    }

    const text = await generateText(buildHydratePrompt(brand, skeletonPiece), {
      jsonMode: true,
      maxTokens: 1024,
    })
    const fields = parseHydrateResponse(text)

    const updated = await db.contentPiece.update({
      where: { id },
      data: { ...fields, status: 'draft' },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate content piece'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
