import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
})

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const campaign = await db.campaign.findUnique({
      where: { id },
      include: { content: { orderBy: { day: 'asc' } } },
    })
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: campaign })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

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
    const existing = await db.campaign.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    const updated = await db.campaign.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update campaign'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const existing = await db.campaign.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    await db.campaign.delete({ where: { id } })
    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete campaign'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
