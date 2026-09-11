import { db } from '@/lib/db'

const SNAPREGISTER_VOICE = {
  tone: 'Helpful, practical, trustworthy',
  personality: 'Smart but approachable — like a knowledgeable friend',
  avoid: ['Pushy sales language', 'Technical jargon', 'Fake urgency'],
  cta: 'Only mention SnapRegister if someone asks how to stay organized',
}

const SNAPREGISTER_CONTEXT = {
  products: [
    'SnapRegister app — snap photo of receipt/product, AI extracts serial/model/warranty info, stores organized',
  ],
  faqs: [
    {
      q: 'What does SnapRegister do?',
      a: 'Helps homeowners, renters, and property managers organize product registrations, receipts, serial numbers, and warranties in one place.',
    },
    {
      q: 'Who is it for?',
      a: 'Homeowners, renters with appliances/electronics, property managers, families managing multiple purchases, small businesses.',
    },
  ],
  targetAudience: [
    'Homeowners',
    'Renters',
    'Property managers',
    'Landlords',
    'First-time homeowners',
  ],
  keyMessages: [
    'Save receipt, serial, model, and warranty card on day 1',
    'Most warranty issues come down to missing proof of purchase',
    'Product registration and warranty tracking made effortless',
  ],
}

export async function POST() {
  try {
    const existing = await db.brand.findUnique({
      where: { slug: 'snapregister' },
    })

    if (existing) {
      return Response.json(
        {
          success: false,
          error: 'SnapRegister brand already exists. Use PATCH /api/brands/:id to update.',
          data: existing,
        },
        { status: 409 }
      )
    }

    const brand = await db.brand.create({
      data: {
        name: 'SnapRegister',
        slug: 'snapregister',
        description: 'AI-Powered Product Registration & Warranty Tracking SaaS',
        logoUrl: null,
        voice: JSON.stringify(SNAPREGISTER_VOICE),
        context: JSON.stringify(SNAPREGISTER_CONTEXT),
        isActive: true,
      },
    })

    return Response.json(
      {
        success: true,
        data: brand,
        message: 'SnapRegister brand seeded successfully.',
      },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Seed failed'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  return Response.json(
    {
      success: false,
      error: 'Use POST /api/seed to seed the SnapRegister brand.',
    },
    { status: 405 }
  )
}
