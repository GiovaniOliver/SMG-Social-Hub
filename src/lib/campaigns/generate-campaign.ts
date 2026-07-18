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

  const hydrated = await Promise.allSettled(
    skeleton.map(async (piece): Promise<GeneratedPiece> => {
      const text = await generateText(buildHydratePrompt(brand, piece), {
        jsonMode: true,
        maxTokens: 1024,
      })
      const fields = parseHydrateResponse(text)
      return { ...piece, ...fields, failed: false }
    })
  )

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
