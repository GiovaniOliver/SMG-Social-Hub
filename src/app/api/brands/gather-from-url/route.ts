import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripHtmlToText } from '@/lib/brand-extraction/html-to-text'
import { extractSuggestedLogo } from '@/lib/brand-extraction/extract-meta'
import { buildExtractionPrompt, parseExtractionResponse } from '@/lib/brand-extraction/prompt'
import { generateText } from '@/lib/ai/providers'
import { isPublicHttpUrl } from '@/lib/security/url-safety'

const schema = z.object({ url: z.string().url() })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'A valid URL is required' }, { status: 400 })
    }

    const { url } = parsed.data

    if (!(await isPublicHttpUrl(url))) {
      return NextResponse.json({ success: false, error: 'That URL is not allowed.' }, { status: 400 })
    }

    const pageRes = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!pageRes.ok) {
      return NextResponse.json(
        { success: false, error: `Could not fetch that URL (${pageRes.status})` },
        { status: 400 }
      )
    }

    const html = (await pageRes.text()).slice(0, 500_000)
    const text = stripHtmlToText(html)
    if (!text) {
      return NextResponse.json({ success: false, error: 'No readable content found at that URL' }, { status: 400 })
    }

    const suggestedLogoUrl = extractSuggestedLogo(html, url) ?? undefined
    const sourceNote = `Extracted from ${url}`
    const prompt = buildExtractionPrompt(text, sourceNote)
    const raw = await generateText(prompt, { jsonMode: true, maxTokens: 1024 })
    const info = parseExtractionResponse(raw, sourceNote)

    return NextResponse.json({ success: true, data: { ...info, suggestedLogoUrl } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to gather brand info from URL'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
