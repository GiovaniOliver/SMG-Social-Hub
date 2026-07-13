import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAllBrands } from '@/lib/brands'

const CreateBrandSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
  voice: z
    .object({
      tone: z.string().default(''),
      personality: z.string().default(''),
      avoid: z.array(z.string()).default([]),
      cta: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      products: z.array(z.string()).default([]),
      faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
      targetAudience: z.array(z.string()).default([]),
      keyMessages: z.array(z.string()).default([]),
    })
    .optional(),
})

export async function GET() {
  try {
    const brands = await getAllBrands()

    const data = brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      logoUrl: b.logoUrl,
      isActive: b.isActive,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }))

    return Response.json({
      success: true,
      data,
      meta: { total: data.length, page: 1, limit: data.length },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch brands'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = CreateBrandSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { success: false, error: validated.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { name, slug, description, logoUrl, voice, context } = validated.data

    const existing = await prisma.brand.findUnique({ where: { slug } })
    if (existing) {
      return Response.json(
        { success: false, error: `A brand with slug "${slug}" already exists` },
        { status: 409 }
      )
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        slug,
        description: description ?? null,
        logoUrl: logoUrl ?? null,
        voice: JSON.stringify(voice ?? {}),
        context: JSON.stringify(context ?? {}),
      },
    })

    return Response.json({ success: true, data: brand }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create brand'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
