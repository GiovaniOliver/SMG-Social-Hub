import { GoogleGenerativeAI } from '@google/generative-ai'
import type { BrandVoice, BrandContext, Platform } from '@/types'
export { CONTENT_TYPES } from './content-types'
export type { ContentType } from './content-types'
import { CONTENT_TYPES } from './content-types'
import type { ContentType } from './content-types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const PLATFORM_CHAR_LIMITS: Record<Platform, number> = {
  TWITTER: 280,
  INSTAGRAM: 2200,
  FACEBOOK: 2000,
  LINKEDIN: 1300,
  TIKTOK: 2200,
  YOUTUBE: 1000,
  REDDIT: 2000,
}

const PLATFORM_STYLE_NOTES: Record<Platform, string> = {
  TWITTER: 'Punchy, concise, hook in the first 8 words. No hashtag spam — max 2. Thread-friendly.',
  INSTAGRAM: 'Visual storytelling opener. Short sentences. 3–5 relevant hashtags at the end. Emojis welcome.',
  FACEBOOK: 'Conversational, a bit longer. Ask a question to drive comments. 1–2 emojis max.',
  LINKEDIN: 'Professional but human. Short paragraphs. Line breaks between ideas. No jargon. 1 CTA.',
  TIKTOK: 'High energy, informal. Start with a hook question or bold claim. Use line breaks. Trend-aware.',
  YOUTUBE: 'Community post style. Conversational. Ask viewers something. 1 link hint OK.',
  REDDIT: 'No marketing speak — sounds authentic, not like an ad. Adds value. No self-promo unless directly relevant.',
}

const CONTENT_TYPE_INSTRUCTIONS: Record<ContentType, string> = {
  educational: 'Share a practical tip, step-by-step guide, or fact the audience will find genuinely useful.',
  story: 'Tell a short relatable story — a challenge faced, a lesson learned, or a brand origin moment.',
  product: 'Highlight one specific feature or benefit. Focus on the outcome for the user, not the feature itself.',
  pain_point: 'Open with the problem the audience feels. Validate it. Then position the solution clearly without being pushy.',
  engagement: 'Ask a question the audience will want to answer. Would-you-rather, fill-in-the-blank, or opinion formats work well.',
  behind_scenes: 'Give a peek behind the curtain — process, team, tools, mistakes. Be real and specific.',
}

function buildSystemPrompt(
  brandName: string,
  voice: BrandVoice,
  context: BrandContext,
  platform: Platform,
  contentType: ContentType,
): string {
  const charLimit = PLATFORM_CHAR_LIMITS[platform]
  const avoid = voice.avoid.length > 0 ? voice.avoid.join(', ') : 'nothing specific'
  const audience = context.targetAudience.length > 0 ? context.targetAudience.join(', ') : 'general audience'
  const messages = context.keyMessages.length > 0
    ? context.keyMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : 'None.'

  return `You are a social media content writer for ${brandName}.

BRAND VOICE:
- Tone: ${voice.tone}
- Personality: ${voice.personality}
- Avoid: ${avoid}${voice.cta ? `\n- CTA style: ${voice.cta}` : ''}

AUDIENCE: ${audience}
KEY MESSAGES:
${messages}

PLATFORM: ${platform}
PLATFORM STYLE: ${PLATFORM_STYLE_NOTES[platform]}
CHARACTER LIMIT: ${charLimit} characters HARD MAX. Target 80% of the limit.

CONTENT TYPE: ${CONTENT_TYPES[contentType]}
INSTRUCTION: ${CONTENT_TYPE_INSTRUCTIONS[contentType]}

RULES:
1. Write specifically for this platform — do NOT use generic copy.
2. Stay under ${charLimit} characters — hard limit.
3. Sound human, not AI-generated marketing copy.
4. Include hashtags ONLY if appropriate (Instagram: 3–5, Twitter: max 2, LinkedIn: 1–2, others: 0).
5. No emojis on Reddit or LinkedIn unless brand voice calls for it.

Return valid JSON only, no other text:
{
  "content": "the post text — must be under ${charLimit} chars",
  "hook": "the first sentence or phrase that grabs attention",
  "tip": "one optional improvement note or empty string"
}`
}

export interface GeneratedPost {
  platform: Platform
  content: string
  hook: string
  tip?: string
  characterCount: number
  characterLimit: number
}

function parseResponse(raw: string): { content: string; hook: string; tip?: string } {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON in response')

  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    content?: unknown
    hook?: unknown
    tip?: unknown
  }

  const content = typeof parsed.content === 'string' ? parsed.content.trim() : ''
  if (!content) throw new Error('Empty content in response')

  return {
    content,
    hook: typeof parsed.hook === 'string' ? parsed.hook.trim() : content.split('\n')[0] ?? '',
    tip: typeof parsed.tip === 'string' && parsed.tip.trim() ? parsed.tip.trim() : undefined,
  }
}

async function generateForPlatform(
  platform: Platform,
  brandName: string,
  voice: BrandVoice,
  context: BrandContext,
  contentType: ContentType,
  topic: string,
): Promise<GeneratedPost> {
  const charLimit = PLATFORM_CHAR_LIMITS[platform]
  const systemPrompt = buildSystemPrompt(brandName, voice, context, platform, contentType)

  const userPrompt = topic.trim()
    ? `Topic/Prompt: ${topic.trim()}`
    : `Write a ${CONTENT_TYPES[contentType]} post for ${brandName}. Choose a relevant topic from the brand context.`

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  })

  const result = await model.generateContent(userPrompt)
  const text = result.response.text()
  const { content, hook, tip } = parseResponse(text)
  const truncated = content.length > charLimit ? content.slice(0, charLimit - 1).trimEnd() : content

  return {
    platform,
    content: truncated,
    hook,
    tip,
    characterCount: truncated.length,
    characterLimit: charLimit,
  }
}

export async function generateContent(
  platforms: Platform[],
  brandName: string,
  voice: BrandVoice,
  context: BrandContext,
  contentType: ContentType,
  topic: string,
): Promise<GeneratedPost[]> {
  const results = await Promise.allSettled(
    platforms.map((p) => generateForPlatform(p, brandName, voice, context, contentType, topic))
  )

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    const platform = platforms[i]!
    return {
      platform,
      content: '',
      hook: '',
      tip: `Generation failed: ${r.reason instanceof Error ? r.reason.message : 'Unknown error'}`,
      characterCount: 0,
      characterLimit: PLATFORM_CHAR_LIMITS[platform],
    } as GeneratedPost
  })
}
