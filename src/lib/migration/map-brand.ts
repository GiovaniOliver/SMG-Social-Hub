export interface BrandFlowBrand {
  id: string
  name: string
  niche: string
  audience: string
  tone: string
  goals: string
  website?: string | null
  websiteContent?: string | null
  brandKit?: string | null
  settings?: string | null
}

export interface BrandEngineFields {
  niche: string
  audience: string
  tone: string
  goals: string
  website: string | null
  websiteContent: string | null
  brandKit: string | null
  engineSettings: string | null
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeBrandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function mapBrandEngineFields(bf: BrandFlowBrand): BrandEngineFields {
  return {
    niche: bf.niche,
    audience: bf.audience,
    tone: bf.tone,
    goals: bf.goals,
    website: bf.website ?? null,
    websiteContent: bf.websiteContent ?? null,
    brandKit: bf.brandKit ?? null,
    engineSettings: bf.settings ?? null,
  }
}
