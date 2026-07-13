import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateReply } from '@/lib/ai/reply-generator'
import { assessReplyRisk } from '@/lib/ai/risk-filter'
import type { ApiResponse, BrandVoice, BrandContext } from '@/types'

function parseVoice(raw: string): BrandVoice {
  try {
    const parsed = JSON.parse(raw) as Partial<BrandVoice>
    return {
      tone: parsed.tone ?? 'friendly',
      personality: parsed.personality ?? 'helpful',
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      cta: parsed.cta,
    }
  } catch {
    return { tone: 'friendly', personality: 'helpful', avoid: [] }
  }
}

function parseContext(raw: string): BrandContext {
  try {
    const parsed = JSON.parse(raw) as Partial<BrandContext>
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      faqs: Array.isArray(parsed.faqs) ? parsed.faqs : [],
      targetAudience: Array.isArray(parsed.targetAudience) ? parsed.targetAudience : [],
      keyMessages: Array.isArray(parsed.keyMessages) ? parsed.keyMessages : [],
    }
  } catch {
    return { products: [], faqs: [], targetAudience: [], keyMessages: [] }
  }
}

interface GenerateReplyResponseData {
  draft: {
    id: string
    content: string
    reasoning: string
    warnings: string[] | undefined
  }
  riskAssessment: {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
    flags: string[]
    requiresHumanReview: boolean
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const opportunity = await prisma.commentOpportunity.findUnique({
    where: { id },
    include: {
      brand: {
        select: {
          name: true,
          voice: true,
          context: true,
        },
      },
    },
  })

  if (!opportunity) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Comment opportunity not found',
    }
    return NextResponse.json(response, { status: 404 })
  }

  const brandVoice = parseVoice(opportunity.brand.voice)
  const brandContext = parseContext(opportunity.brand.context)

  let generated: Awaited<ReturnType<typeof generateReply>>
  try {
    generated = await generateReply({
      platform: opportunity.platform,
      postContent: opportunity.postContent ?? undefined,
      commentText: opportunity.commentText ?? undefined,
      authorName: opportunity.authorName ?? undefined,
      brandName: opportunity.brand.name,
      brandVoice,
      brandContext,
      isOwned: opportunity.isOwned,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed'
    const response: ApiResponse<never> = {
      success: false,
      error: `Failed to generate reply: ${message}`,
    }
    return NextResponse.json(response, { status: 502 })
  }

  const riskAssessment = assessReplyRisk(
    opportunity.commentText ?? opportunity.postContent ?? '',
    generated.content
  )

  // Merge AI-flagged warnings with risk filter flags
  const allWarnings = [
    ...(generated.warnings ?? []),
    ...riskAssessment.flags,
  ]
  const uniqueWarnings = Array.from(new Set(allWarnings))

  const draft = await prisma.commentDraft.create({
    data: {
      opportunityId: id,
      content: generated.content,
      isApproved: false,
    },
  })

  // Advance status to DRAFT_READY only if still at PENDING
  if (opportunity.status === 'PENDING') {
    await prisma.commentOpportunity.update({
      where: { id: id },
      data: { status: 'DRAFT_READY' },
    })
  }

  const responseData: GenerateReplyResponseData = {
    draft: {
      id: draft.id,
      content: generated.content,
      reasoning: generated.reasoning,
      warnings: uniqueWarnings.length > 0 ? uniqueWarnings : undefined,
    },
    riskAssessment,
  }

  const response: ApiResponse<GenerateReplyResponseData> = {
    success: true,
    data: responseData,
  }

  return NextResponse.json(response, { status: 201 })
}
