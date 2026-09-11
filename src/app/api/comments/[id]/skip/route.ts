import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { ApiResponse } from '@/types'

interface SkipResponseData {
  opportunityId: string
  status: string
  updatedAt: string
}

export async function POST(
  _request: NextRequest,
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

  if (opportunity.status === 'POSTED') {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Cannot skip an already-posted opportunity',
    }
    return NextResponse.json(response, { status: 422 })
  }

  const updated = await db.commentOpportunity.update({
    where: { id: id },
    data: { status: 'SKIPPED' },
  })

  const response: ApiResponse<SkipResponseData> = {
    success: true,
    data: {
      opportunityId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    },
  }

  return NextResponse.json(response)
}
