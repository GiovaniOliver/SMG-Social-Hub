import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const IN = process.env.MIGRATION_FILE
  || 'C:/Users/OliverProductions/Desktop/2.DEVELOPMENT Work/SMG-Social-Hub/scripts/.migration-data/brandflow-export.json'

// Explicit BrandFlow brand id -> existing Hub brand id (same real brand, different ids).
const BRAND_ID_MAP = {
  cmnqbb99d0001s6gv671c4jqk: 'cmo813wzx0000argsfe8u9cp9', // SnapRegister -> Snap Registers
}

const normalizeBrandKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const mapBrandEngineFields = (bf) => ({
  niche: bf.niche, audience: bf.audience, tone: bf.tone, goals: bf.goals,
  website: bf.website ?? null, websiteContent: bf.websiteContent ?? null,
  brandKit: bf.brandKit ?? null, engineSettings: bf.settings ?? null,
})

const prisma = new PrismaClient()

async function resolveHubBrandId(bf, hubBrands) {
  if (BRAND_ID_MAP[bf.id]) return BRAND_ID_MAP[bf.id]
  const key = normalizeBrandKey(bf.name)
  const match = hubBrands.find((h) => normalizeBrandKey(h.name) === key)
  return match ? match.id : null
}

async function main() {
  const data = JSON.parse(readFileSync(IN, 'utf8'))
  const hubBrands = await prisma.brand.findMany({ select: { id: true, name: true } })
  let campaignsUp = 0, piecesUp = 0

  for (const bf of data.brands) {
    let hubBrandId = await resolveHubBrandId(bf, hubBrands)
    const engine = mapBrandEngineFields(bf)

    if (hubBrandId) {
      // Backfill engine fields onto the existing Hub brand (do NOT touch voice/context).
      await prisma.brand.update({ where: { id: hubBrandId }, data: engine })
    } else {
      // No existing match — create a new brand (reuse BF id, generate a unique slug).
      const base = bf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      let slug = base, n = 1
      while (await prisma.brand.findUnique({ where: { slug } })) slug = `${base}-${++n}`
      const created = await prisma.brand.create({ data: { id: bf.id, name: bf.name, slug, ...engine } })
      hubBrandId = created.id
    }

    for (const c of bf.campaigns) {
      await prisma.campaign.upsert({
        where: { id: c.id },
        update: { name: c.name, description: c.description, status: c.status, analysis: c.analysis, trends: c.trends, metadata: c.metadata, brandId: hubBrandId },
        create: { id: c.id, brandId: hubBrandId, name: c.name, description: c.description, status: c.status, analysis: c.analysis, trends: c.trends, metadata: c.metadata, createdAt: new Date(c.createdAt) },
      })
      campaignsUp++
      for (const p of c.content) {
        const piece = {
          campaignId: c.id, brandId: hubBrandId, day: p.day, platform: p.platform, format: p.format,
          title: p.title, hook: p.hook, body: p.body, visualPrompt: p.visualPrompt, status: p.status,
          mediaUrl: p.mediaUrl, mediaType: p.mediaType, audioUrl: p.audioUrl, scheduledAt: p.scheduledAt,
          keywords: p.keywords, performanceScore: p.performanceScore, script: p.script,
          referenceImageUrl: p.referenceImageUrl, metadata: p.metadata,
        }
        await prisma.contentPiece.upsert({ where: { id: p.id }, update: piece, create: { id: p.id, ...piece } })
        piecesUp++
      }
    }
  }
  console.log(`Imported/updated ${campaignsUp} campaign(s), ${piecesUp} piece(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
