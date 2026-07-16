import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { loadKeys, saveKeys, getKeyStatus } from '@/lib/ai/providers'

const schema = z.object({
  gemini: z.string().optional(),
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  defaultProvider: z.enum(['gemini', 'anthropic', 'openai', 'ollama']).optional(),
})

export async function GET() {
  return NextResponse.json({ success: true, data: getKeyStatus() })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const { gemini, anthropic, openai, ollamaBaseUrl, defaultProvider } = parsed.data
    const existing = loadKeys()

    // Empty string clears a key; undefined leaves the stored value untouched.
    saveKeys({
      gemini: gemini !== undefined ? gemini || undefined : existing.gemini,
      anthropic: anthropic !== undefined ? anthropic || undefined : existing.anthropic,
      openai: openai !== undefined ? openai || undefined : existing.openai,
      ollamaBaseUrl: ollamaBaseUrl !== undefined ? ollamaBaseUrl || undefined : existing.ollamaBaseUrl,
      defaultProvider: defaultProvider ?? existing.defaultProvider,
    })

    return NextResponse.json({ success: true, data: getKeyStatus() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save keys'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
