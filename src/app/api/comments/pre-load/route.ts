import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import type { ApiResponse } from '@/types'

const RequestSchema = z.object({
  brandId: z.string().min(1, 'brandId is required'),
})

interface PreloadEntry {
  postUrl: string
  postTitle: string
  relevanceNote: string
}

const SNAPREGISTER_OPPORTUNITIES: PreloadEntry[] = [
  {
    postUrl:
      'https://www.facebook.com/groups/ninjafoodipossiblecookercommunity/posts/1004948384815729/',
    postTitle: 'Ninja/Shark product registration issue',
    relevanceNote:
      'User experiencing issues registering their Ninja/Shark appliance — SnapRegister solves cross-brand product registration pain points.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/242515173295634/posts/1508585700021902/',
    postTitle: 'Do I need to register my machine for warranty?',
    relevanceNote:
      'User asking about product registration for warranty — a core use case SnapRegister addresses by simplifying the registration flow.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/267243452020461/posts/437847264960078/',
    postTitle: 'Where do I register for warranty?',
    relevanceNote:
      'User confused about where to register for warranty — SnapRegister provides a single destination for all product registrations.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/greenworks/posts/1535663500704122/',
    postTitle: 'Greenworks warranty question',
    relevanceNote:
      'User asking about Greenworks warranty process — SnapRegister supports multi-brand registration and simplifies the process for tools and outdoor equipment.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/greenworks/posts/1854591488811320/',
    postTitle: "Can't register products on company website?",
    relevanceNote:
      'User frustrated with manufacturer registration portals being broken or slow — SnapRegister provides a reliable alternative registration pathway.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/lgglobal/posts/1999704720455919/',
    postTitle: 'LG product registration problems',
    relevanceNote:
      'User struggling with LG product registration — SnapRegister supports electronics registration and can capture warranty info across brands.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/571922226972990/posts/2087876632044201/',
    postTitle: "Can I get a copy of my receipt? — Costco thread",
    relevanceNote:
      'Costco members discussing receipt/proof-of-purchase for warranty claims — SnapRegister can help users store purchase records alongside product registrations.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/951547104907360/posts/24538560615779344/',
    postTitle: 'Home warranty recommendation thread',
    relevanceNote:
      'Homeowners discussing home warranty products and appliance coverage — SnapRegister helps catalog registered appliances, useful for warranty claims.',
  },
  {
    postUrl:
      'https://www.facebook.com/groups/professionalhosts/posts/5565810383515608/',
    postTitle: 'Property-host home warranty discussion',
    relevanceNote:
      'Professional hosts managing multiple properties discussing appliance warranty tracking — SnapRegister is ideal for hosts managing registrations across multiple properties.',
  },
]

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      }
      return NextResponse.json(response, { status: 400 })
    }

    const { brandId } = parsed.data

    // Verify brand exists
    const brand = await prisma.brand.findUnique({ where: { id: brandId } })
    if (!brand) {
      const response: ApiResponse<never> = {
        success: false,
        error: `Brand not found: ${brandId}`,
      }
      return NextResponse.json(response, { status: 404 })
    }

    let created = 0
    let skipped = 0

    for (const entry of SNAPREGISTER_OPPORTUNITIES) {
      const existing = await prisma.commentOpportunity.findFirst({
        where: { brandId, postUrl: entry.postUrl },
      })

      if (existing) {
        skipped++
        continue
      }

      await prisma.commentOpportunity.create({
        data: {
          brandId,
          platform: 'FACEBOOK',
          postUrl: entry.postUrl,
          postTitle: entry.postTitle,
          isOwned: false,
          relevanceNote: entry.relevanceNote,
          status: 'PENDING',
        },
      })

      created++
    }

    const response: ApiResponse<{ created: number; skipped: number; total: number }> = {
      success: true,
      data: {
        created,
        skipped,
        total: SNAPREGISTER_OPPORTUNITIES.length,
      },
    }
    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Pre-load failed',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
