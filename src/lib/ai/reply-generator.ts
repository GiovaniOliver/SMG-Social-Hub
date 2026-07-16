import type { BrandVoice, BrandContext } from '@/types'
import { generateText } from './providers'

// Fast, cost-efficient model for high-volume comment replies. Bump to
// 'claude-opus-4-8' if reply quality matters more than cost/latency.
const MODEL = 'claude-haiku-4-5'

const PLATFORM_LIMITS: Record<string, number> = {
  TWITTER: 280,
  INSTAGRAM: 2200,
  FACEBOOK: 8000,
  LINKEDIN: 1250,
  TIKTOK: 2200,
  YOUTUBE: 10000,
  REDDIT: 10000,
}

const SUGGESTED_LENGTHS: Record<string, number> = {
  TWITTER: 250,
  INSTAGRAM: 400,
  FACEBOOK: 400,
  LINKEDIN: 400,
  TIKTOK: 400,
  YOUTUBE: 400,
  REDDIT: 400,
}

export interface ReplyGeneratorParams {
  platform: string
  postContent?: string
  commentText?: string
  authorName?: string
  brandName: string
  brandVoice: BrandVoice
  brandContext: BrandContext
  isOwned: boolean
  maxLength?: number
}

export interface GeneratedReply {
  content: string
  reasoning: string
  warnings?: string[]
}

function buildFaqText(faqs: Array<{ q: string; a: string }>): string {
  if (faqs.length === 0) return 'None provided.'
  return faqs.map((faq, i) => `${i + 1}. Q: ${faq.q}\n   A: ${faq.a}`).join('\n')
}

function buildSystemPrompt(params: ReplyGeneratorParams, charLimit: number): string {
  const { brandName, brandVoice, brandContext, platform, isOwned } = params

  const audienceText = brandContext.targetAudience.length > 0
    ? brandContext.targetAudience.join(', ')
    : 'General audience'

  const keyMessagesText = brandContext.keyMessages.length > 0
    ? brandContext.keyMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : 'None provided.'

  const productsText = brandContext.products.length > 0
    ? brandContext.products.join(', ')
    : 'None listed.'

  const avoidText = brandVoice.avoid.length > 0
    ? brandVoice.avoid.join(', ')
    : 'Nothing specified.'

  const channelType = isOwned
    ? 'This is on your OWN channel/page — you can be slightly more on-brand, but helpfulness still comes first.'
    : 'This is an EXTERNAL community — never sell, always help first. Do not push the brand unless directly asked.'

  return `You are a social media engagement assistant for ${brandName}.

BRAND VOICE:
- Tone: ${brandVoice.tone}
- Personality: ${brandVoice.personality}
- Avoid: ${avoidText}${brandVoice.cta ? `\n- CTA hint: ${brandVoice.cta}` : ''}

BRAND CONTEXT:
Products: ${productsText}
Target Audience: ${audienceText}
Key Messages:
${keyMessagesText}

Relevant FAQs:
${buildFaqText(brandContext.faqs)}

PLATFORM: ${platform}
CHARACTER LIMIT: ${charLimit} characters (hard max). Suggested length: ${SUGGESTED_LENGTHS[platform] ?? 400} characters.

CHANNEL TYPE: ${channelType}

ENGAGEMENT RULES (non-negotiable):
1. Start with empathy OR the exact problem the person is experiencing.
2. Give a practical 2–4 step answer when possible.
3. Never lead with a product mention or drop a product link in the first comment.
4. Only mention ${brandName} if the comment directly asks how to stay organized, track products, or manage warranties.
5. If the comment involves legal threats, refund requests, chargebacks, injury claims, or fraud accusations — flag it with a WARNING and draft a neutral handoff message.
6. Keep it conversational, concise, and genuinely helpful.
7. No fake urgency. No false promises. No legal commitments.
8. Match the voice: ${brandVoice.tone}, ${brandVoice.personality}.

RESPONSE FORMAT — return valid JSON only, no other text:
{
  "content": "the reply text (must be under ${charLimit} chars)",
  "reasoning": "1–2 sentences explaining your approach",
  "warnings": ["any flags, or empty array if none"]
}`
}

function buildUserPrompt(params: ReplyGeneratorParams): string {
  const { postContent, commentText, authorName } = params

  const postSection = postContent
    ? `POST CONTENT:\n${postContent.slice(0, 2000)}`
    : 'POST CONTENT: (not provided)'

  const commentSection = commentText
    ? `COMMENT FROM ${authorName ?? 'user'}:\n"${commentText.slice(0, 1000)}"`
    : 'CONTEXT: Responding to the post itself (no specific comment provided).'

  return `${postSection}\n\n${commentSection}\n\nGenerate a reply. Return only valid JSON.`
}

function parseModelResponse(text: string): GeneratedReply {
  const trimmed = text.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Claude response did not contain valid JSON')
  }

  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
    content?: unknown
    reasoning?: unknown
    warnings?: unknown
  }

  const content = typeof parsed.content === 'string' ? parsed.content : ''
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : ''
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((w): w is string => typeof w === 'string')
    : []

  if (!content) throw new Error('Claude returned empty content')

  return { content, reasoning, warnings: warnings.length > 0 ? warnings : undefined }
}

export async function generateReply(params: ReplyGeneratorParams): Promise<GeneratedReply> {
  const platform = params.platform.toUpperCase()
  const hardLimit = params.maxLength ?? PLATFORM_LIMITS[platform] ?? 400
  const systemPrompt = buildSystemPrompt({ ...params, platform }, hardLimit)
  const userPrompt = buildUserPrompt(params)

  const text = await generateText(userPrompt, {
    provider: 'anthropic',
    model: MODEL,
    systemPrompt,
    maxTokens: 1024,
  })

  const reply = parseModelResponse(text)

  if (reply.content.length > hardLimit) {
    return {
      ...reply,
      content: reply.content.slice(0, hardLimit - 1).trimEnd(),
      warnings: [
        ...(reply.warnings ?? []),
        `Reply was truncated to fit the ${platform} character limit of ${hardLimit}.`,
      ],
    }
  }

  return reply
}
