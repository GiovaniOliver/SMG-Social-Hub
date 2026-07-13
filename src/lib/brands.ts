import { prisma } from '@/lib/db'
import type { BrandVoice, BrandContext } from '@/types'

export interface ParsedBrand {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  voice: BrandVoice
  context: BrandContext
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

function parseVoice(raw: string): BrandVoice {
  try {
    const parsed = JSON.parse(raw)
    return {
      tone: parsed.tone ?? '',
      personality: parsed.personality ?? '',
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      cta: parsed.cta,
    }
  } catch {
    return { tone: '', personality: '', avoid: [] }
  }
}

function parseContext(raw: string): BrandContext {
  try {
    const parsed = JSON.parse(raw)
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

function mapBrand(brand: {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  voice: string
  context: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): ParsedBrand {
  return {
    ...brand,
    voice: parseVoice(brand.voice),
    context: parseContext(brand.context),
  }
}

export async function getBrandBySlug(slug: string): Promise<ParsedBrand | null> {
  const brand = await prisma.brand.findUnique({
    where: { slug },
  })

  if (!brand) return null

  return mapBrand(brand)
}

export async function getBrandById(id: string): Promise<ParsedBrand | null> {
  const brand = await prisma.brand.findUnique({
    where: { id },
  })

  if (!brand) return null

  return mapBrand(brand)
}

export async function getAllBrands(): Promise<ParsedBrand[]> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  return brands.map(mapBrand)
}
