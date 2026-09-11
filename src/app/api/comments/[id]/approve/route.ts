import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { ApiResponse } from '@/types'

const approveSchema = z.object({
  draftId: z.string().optional(),
  customReply: z.string().min(1).max(10000).optional(),
}).refine(
  (data) => data.draftId !== undefined || data.customReply !== undefined,
  { message: 'Either draftId or customReply must be provided' }
)

interface ApproveResponseData {
  opportunityId: string
  approvedReply: string
  status: string
  updatedAt: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const opportunity = await db.commentOpportunity.findUnique({
    where: { id },
  })

  if (!opportunity) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Comment opportunity not found',
    }
    return NextResponse.json(response, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    const response: ApiResponse<never> = { success: false, error: 'Invalid JSON body' }
    return NextResponse.json(response, { status: 400 })
  }

  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    }
    return NextResponse.json(response, { status: 422 })
  }

  const { draftId, customReply } = parsed.data
  let approvedContent: string

  if (draftId) {
    const draft = await db.commentDraft.findUnique({
      where: { id: draftId },
    })

    if (!draft || draft.opportunityId !== id) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Draft not found for this opportunity',
      }
      return NextResponse.json(response, { status: 404 })
    }

    approvedContent = customReply ?? draft.content

    // Mark this draft as approved
    await db.commentDraft.update({
      where: { id: draftId },
      data: { isApproved: true },
    })
  } else {
    // Manual custom reply — no draft to mark
    approvedContent = customReply as string
  }

  const updatedOpportunity = await db.commentOpportunity.update({
    where: { id: id },
    data: {
      approvedReply: approvedContent,
      status: 'APPROVED',
    },
  })

  const response: ApiResponse<ApproveResponseData> = {
    success: true,
    data: {
      opportunityId: updatedOpportunity.id,
      approvedReply: approvedContent,
      status: updatedOpportunity.status,
      updatedAt: updatedOpportunity.updatedAt.toISOString(),
    },
  }

  return NextResponse.json(response)
}
