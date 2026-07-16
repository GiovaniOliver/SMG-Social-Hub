import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getBrandById } from '@/lib/brands'
import { isValidLogoUrl } from '@/lib/uploads'

const UpdateBrandSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  logoUrl: z.string().refine(isValidLogoUrl, { message: 'logoUrl must be an absolute http(s) URL or a path starting with /' }).nullable().optional(),
  isActive: z.boolean().optional(),
  voice: z
    .object({
      tone: z.string(),
      personality: z.string(),
      avoid: z.array(z.string()),
      cta: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      products: z.array(z.string()),
      faqs: z.array(z.object({ q: z.string(), a: z.string() })),
      targetAudience: z.array(z.string()),
      keyMessages: z.array(z.string()),
    })
    .optional(),
  niche: z.string().max(300).nullable().optional(),
  audience: z.string().max(300).nullable().optional(),
  tone: z.string().max(300).nullable().optional(),
  goals: z.array(z.string()).nullable().optional(),
  website: z.string().url().nullable().optional(),
  websiteContent: z.string().max(20000).nullable().optional(),
  appStoreUrl: z.string().url().nullable().optional(),
  socialUrls: z.record(z.string(), z.string().url()).nullable().optional(),
  localFolderPath: z.string().max(500).nullable().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params
  try {
    const brand = await getBrandById(id)
    if (!brand) {
      return Response.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }
    return Response.json({ success: true, data: brand })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch brand'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params
  try {
    const body = await request.json()
    const validated = UpdateBrandSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { success: false, error: validated.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { voice, context, goals, socialUrls, ...rest } = validated.data

    const existing = await prisma.brand.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: {
        ...rest,
        ...(voice !== undefined ? { voice: JSON.stringify(voice) } : {}),
        ...(context !== undefined ? { context: JSON.stringify(context) } : {}),
        ...(goals !== undefined ? { goals: JSON.stringify(goals ?? []) } : {}),
        ...(socialUrls !== undefined ? { socialUrls: JSON.stringify(socialUrls ?? {}) } : {}),
      },
    })

    return Response.json({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update brand'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params
  try {
    const existing = await prisma.brand.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    await prisma.brand.delete({ where: { id } })
    return Response.json({ success: true, data: { deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete brand'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
