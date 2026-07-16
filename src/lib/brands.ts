import { prisma } from '@/lib/db'
import type { BrandVoice, BrandContext, Platform } from '@/types'
import { PLATFORMS } from '@/types'

export interface ParsedBrand {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  voice: BrandVoice
  context: BrandContext
  niche: string | null
  audience: string | null
  tone: string | null
  goals: string[]
  website: string | null
  websiteContent: string | null
  appStoreUrl: string | null
  socialUrls: Partial<Record<Platform, string>>
  localFolderPath: string | null
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

export function parseGoals(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

export function parseSocialUrls(raw: string | null): Partial<Record<Platform, string>> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const result: Partial<Record<Platform, string>> = {}
    for (const platform of PLATFORMS) {
      const value = parsed[platform]
      if (typeof value === 'string' && value.trim()) result[platform] = value.trim()
    }
    return result
  } catch {
    return {}
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
  niche: string | null
  audience: string | null
  tone: string | null
  goals: string | null
  website: string | null
  websiteContent: string | null
  appStoreUrl: string | null
  socialUrls: string | null
  localFolderPath: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): ParsedBrand {
  return {
    ...brand,
    voice: parseVoice(brand.voice),
    context: parseContext(brand.context),
    goals: parseGoals(brand.goals),
    socialUrls: parseSocialUrls(brand.socialUrls),
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
