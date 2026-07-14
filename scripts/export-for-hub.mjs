import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = process.env.MIGRATION_FILE
  || 'C:/Users/OliverProductions/Desktop/2.DEVELOPMENT Work/SMG-Social-Hub/scripts/.migration-data/brandflow-export.json'

const prisma = new PrismaClient()

async function main() {
  const brands = await prisma.brand.findMany({
    include: { campaigns: { include: { content: true } } },
  })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ exportedFrom: 'brandflow', brands }, null, 2))
  const campaigns = brands.reduce((n, b) => n + b.campaigns.length, 0)
  const pieces = brands.reduce((n, b) => n + b.campaigns.reduce((m, c) => m + c.content.length, 0), 0)
  console.log(`Exported ${brands.length} brand(s), ${campaigns} campaign(s), ${pieces} piece(s) -> ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
