import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { PLATFORMS } from '@/types'
import type { Platform } from '@/types'
import { CONTENT_FORMATS, type ContentFormat } from '@/lib/campaigns/prompts'

type RouteContext = { params: Promise<{ id: string }> }

const UpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  hook: z.string().max(2000).optional(),
  body: z.string().max(10000).optional(),
  visualPrompt: z.string().max(4000).optional(),
  platform: z.enum(PLATFORMS as [Platform, ...Platform[]]).optional(),
  format: z.enum(CONTENT_FORMATS as [ContentFormat, ...ContentFormat[]]).optional(),
  day: z.number().int().min(1).optional(),
})

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    const existing = await prisma.contentPiece.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Content piece not found' }, { status: 404 })
    }
    const updated = await prisma.contentPiece.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update content piece'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const existing = await prisma.contentPiece.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Content piece not found' }, { status: 404 })
    }
    await prisma.contentPiece.delete({ where: { id } })
    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete content piece'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
