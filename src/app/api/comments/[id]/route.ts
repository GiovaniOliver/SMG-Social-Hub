import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { ApiResponse } from '@/types'

const PatchBodySchema = z.object({
  status: z
    .enum(['PENDING', 'DRAFT_READY', 'APPROVED', 'POSTED', 'SKIPPED'])
    .optional(),
  approvedReply: z.string().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params
  try {
    const opportunity = await db.commentOpportunity.findUnique({
      where: { id },
      include: {
        drafts: { orderBy: { createdAt: 'desc' } },
        brand: {
          select: { id: true, name: true, slug: true, voice: true, context: true },
        },
      },
    })

    if (!opportunity) {
      const response: ApiResponse<never> = { success: false, error: 'Opportunity not found' }
      return NextResponse.json(response, { status: 404 })
    }

    const response: ApiResponse<typeof opportunity> = { success: true, data: opportunity }
    return NextResponse.json(response)
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch opportunity',
    }
    return NextResponse.json(response, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params
  try {
    const body: unknown = await request.json()
    const parsed = PatchBodySchema.safeParse(body)

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      }
      return NextResponse.json(response, { status: 400 })
    }

    const existing = await db.commentOpportunity.findUnique({ where: { id } })
    if (!existing) {
      const response: ApiResponse<never> = { success: false, error: 'Opportunity not found' }
      return NextResponse.json(response, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status
    if (parsed.data.approvedReply !== undefined) updateData.approvedReply = parsed.data.approvedReply

    const updated = await db.commentOpportunity.update({
      where: { id },
      data: updateData,
      include: {
        drafts: { orderBy: { createdAt: 'desc' } },
        brand: { select: { id: true, name: true, slug: true, voice: true, context: true } },
      },
    })

    const response: ApiResponse<typeof updated> = { success: true, data: updated }
    return NextResponse.json(response)
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update opportunity',
    }
    return NextResponse.json(response, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = await params
  try {
    const existing = await db.commentOpportunity.findUnique({ where: { id } })
    if (!existing) {
      const response: ApiResponse<never> = { success: false, error: 'Opportunity not found' }
      return NextResponse.json(response, { status: 404 })
    }

    await db.commentOpportunity.delete({ where: { id } })

    const response: ApiResponse<{ deleted: true }> = { success: true, data: { deleted: true } }
    return NextResponse.json(response)
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete opportunity',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
