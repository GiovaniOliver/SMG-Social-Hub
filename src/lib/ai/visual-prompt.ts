import type { BrandVoice, BrandContext } from '@/types'
import { generateText } from './providers'

export type VisualMediaType = 'image' | 'video'

export interface BuildVisualPromptParams {
  mediaType: VisualMediaType
  brandName: string
  brandVoice: BrandVoice
  brandContext: BrandContext
  postContent: string
  postHook: string
}

const SYSTEM_PROMPTS: Record<VisualMediaType, string> = {
  image:
    'You are a world-class Art Director and Photographer. Focus on composition, lighting (golden hour, soft studio, etc.), and aesthetic consistency. Describe textures, colors, and vibe in detail.',
  video:
    'You are a world-class Video Producer, Cinematographer, and Visual Storyteller. Create a high-fidelity, cinematic video description: narrative arc, camera movement, lighting, atmosphere, and subject action. Use technical film terms and sensory language.',
}

export async function buildVisualPrompt(params: BuildVisualPromptParams): Promise<string> {
  const { mediaType, brandName, brandVoice, brandContext, postContent, postHook } = params
  const system = SYSTEM_PROMPTS[mediaType]

  const prompt = `${system}

Brand: ${brandName} | Tone: ${brandVoice.tone} | Personality: ${brandVoice.personality}
Products: ${brandContext.products.length > 0 ? brandContext.products.join(', ') : 'None listed.'}

Write a single, detailed ${mediaType} generation prompt (plain text, 2-4 sentences, no JSON, no markdown) for a visual to accompany this social post:
Hook: ${postHook}
Content: ${postContent.slice(0, 500)}`

  const text = await generateText(prompt, { maxTokens: 300, temperature: 0.8 })
  return text.trim()
}
