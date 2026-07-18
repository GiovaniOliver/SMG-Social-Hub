import type { ParsedBrand } from '@/lib/brands'
import { generateText } from '@/lib/ai/providers'
import {
  buildRoadmapPrompt,
  parseRoadmapResponse,
  buildSkeletonPrompt,
  parseSkeletonResponse,
  buildHydratePrompt,
  parseHydrateResponse,
  type Roadmap,
  type SkeletonPiece,
} from './prompts'

export interface GeneratedPiece extends SkeletonPiece {
  hook: string
  body: string
  visualPrompt: string
  failed: boolean
}

export interface GenerateCampaignParams {
  brand: ParsedBrand
  durationDays: number
  piecesPerDay: number
}

export interface GenerateCampaignResult {
  roadmap: Roadmap
  pieces: GeneratedPiece[]
}

const SKELETON_BATCH_SIZE = 15
const HYDRATE_CONCURRENCY = 8

export async function generateCampaignContent(
  params: GenerateCampaignParams
): Promise<GenerateCampaignResult> {
  const { brand, durationDays, piecesPerDay } = params

  const roadmapText = await generateText(buildRoadmapPrompt(brand, durationDays), {
    jsonMode: true,
    maxTokens: 1024,
  })
  const roadmap = parseRoadmapResponse(roadmapText)

  const skeleton: SkeletonPiece[] = []
  for (let startDay = 1; startDay <= durationDays; startDay += SKELETON_BATCH_SIZE) {
    const numDays = Math.min(SKELETON_BATCH_SIZE, durationDays - startDay + 1)
    const batchText = await generateText(
      buildSkeletonPrompt(brand, roadmap, startDay, numDays, piecesPerDay),
      { jsonMode: true, maxTokens: 2048 }
    )
    skeleton.push(...parseSkeletonResponse(batchText))
  }

  if (skeleton.length === 0) {
    throw new Error('AI did not generate any content pieces for this campaign.')
  }

  const hydrated = await hydrateWithConcurrencyLimit(brand, skeleton)

  const pieces: GeneratedPiece[] = hydrated.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    const piece = skeleton[i]!
    const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error'
    return {
      ...piece,
      hook: '',
      body: `[Generation failed: ${reason}]`,
      visualPrompt: '',
      failed: true,
    }
  })

  return { roadmap, pieces }
}

// Hydrates skeleton pieces with bounded concurrency so a large campaign
// (up to 60 days * 5 pieces/day = 300 pieces) doesn't fire 300 simultaneous
// provider requests and trip rate limits.
async function hydrateWithConcurrencyLimit(
  brand: ParsedBrand,
  skeleton: SkeletonPiece[]
): Promise<PromiseSettledResult<GeneratedPiece>[]> {
  const results: PromiseSettledResult<GeneratedPiece>[] = new Array(skeleton.length)
  let nextIndex = 0

  async function worker() {
    for (let i = nextIndex++; i < skeleton.length; i = nextIndex++) {
      try {
        const text = await generateText(buildHydratePrompt(brand, skeleton[i]!), {
          jsonMode: true,
          maxTokens: 1024,
        })
        const fields = parseHydrateResponse(text)
        results[i] = { status: 'fulfilled', value: { ...skeleton[i]!, ...fields, failed: false } }
      } catch (error) {
        results[i] = { status: 'rejected', reason: error }
      }
    }
  }

  const workerCount = Math.min(HYDRATE_CONCURRENCY, skeleton.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
