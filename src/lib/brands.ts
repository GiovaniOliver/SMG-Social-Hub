import { db } from '@/lib/db'
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

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseVoice(raw: unknown): BrandVoice {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const parsed = raw as Record<string, unknown>
    return {
      tone: typeof parsed.tone === 'string' ? parsed.tone : '',
      personality: typeof parsed.personality === 'string' ? parsed.personality : '',
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid.filter((value): value is string => typeof value === 'string') : [],
      cta: typeof parsed.cta === 'string' ? parsed.cta : undefined,
    }
  }

  if (typeof raw !== 'string') return { tone: '', personality: '', avoid: [] }

  try {
    return parseVoice(JSON.parse(raw))
  } catch {
    return { tone: '', personality: '', avoid: [] }
  }
}

function isFaq(value: unknown): value is { q: string; a: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const faq = value as Record<string, unknown>
  return typeof faq.q === 'string' && typeof faq.a === 'string'
}

function parseContext(raw: unknown): BrandContext {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const parsed = raw as Record<string, unknown>
    return {
      products: Array.isArray(parsed.products) ? parsed.products.filter((value): value is string => typeof value === 'string') : [],
      faqs: Array.isArray(parsed.faqs) ? parsed.faqs.filter(isFaq) : [],
      targetAudience: Array.isArray(parsed.targetAudience) ? parsed.targetAudience.filter((value): value is string => typeof value === 'string') : [],
      keyMessages: Array.isArray(parsed.keyMessages) ? parsed.keyMessages.filter((value): value is string => typeof value === 'string') : [],
    }
  }

  if (typeof raw !== 'string') return { products: [], faqs: [], targetAudience: [], keyMessages: [] }

  try {
    return parseContext(JSON.parse(raw))
  } catch {
    return { products: [], faqs: [], targetAudience: [], keyMessages: [] }
  }
}

export function parseGoals(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string')
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

export function parseSocialUrls(raw: unknown): Partial<Record<Platform, string>> {
  let parsed: Record<string, unknown>

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>
  } else if (typeof raw === 'string' && raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  } else {
    return {}
  }

  const result: Partial<Record<Platform, string>> = {}
  for (const platform of PLATFORMS) {
    const value = parsed[platform]
    if (typeof value === 'string' && value.trim()) result[platform] = value.trim()
  }
  return result
}

function mapBrand(brand: Record<string, unknown>): ParsedBrand {
  return {
    id: String(brand.id ?? ''),
    name: String(brand.name ?? ''),
    slug: String(brand.slug ?? ''),
    description: asNullableString(brand.description),
    logoUrl: asNullableString(brand.logoUrl),
    voice: parseVoice(brand.voice),
    context: parseContext(brand.context),
    niche: asNullableString(brand.niche),
    audience: asNullableString(brand.audience),
    tone: asNullableString(brand.tone),
    goals: parseGoals(brand.goals),
    website: asNullableString(brand.website),
    websiteContent: asNullableString(brand.websiteContent),
    appStoreUrl: asNullableString(brand.appStoreUrl),
    socialUrls: parseSocialUrls(brand.socialUrls),
    localFolderPath: asNullableString(brand.localFolderPath),
    isActive: brand.isActive !== false,
    createdAt: brand.createdAt instanceof Date ? brand.createdAt : new Date(String(brand.createdAt)),
    updatedAt: brand.updatedAt instanceof Date ? brand.updatedAt : new Date(String(brand.updatedAt)),
  }
}

export async function getBrandBySlug(slug: string): Promise<ParsedBrand | null> {
  const brand = await db.brand.findUnique({ where: { slug } })
  return brand ? mapBrand(brand) : null
}

export async function getBrandById(id: string): Promise<ParsedBrand | null> {
  const brand = await db.brand.findUnique({ where: { id } })
  return brand ? mapBrand(brand) : null
}

export async function getAllBrands(): Promise<ParsedBrand[]> {
  const brands = await db.brand.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  return brands.map((brand) => mapBrand(brand))
}
