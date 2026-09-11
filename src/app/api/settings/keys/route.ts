import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getAIIntegrationStatus,
  saveAIIntegrationSettings,
} from '@/lib/ai/providers'

const schema = z.object({
  gemini: z.string().optional(),
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  runware: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  defaultProvider: z.enum(['gemini', 'anthropic', 'openai', 'ollama']).optional(),
})

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await getAIIntegrationStatus() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load settings'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const tasks: Promise<void>[] = []
    if (parsed.data.gemini) tasks.push(saveAIIntegrationSettings({ provider: 'gemini', secret: parsed.data.gemini }))
    if (parsed.data.anthropic) tasks.push(saveAIIntegrationSettings({ provider: 'anthropic', secret: parsed.data.anthropic }))
    if (parsed.data.openai) tasks.push(saveAIIntegrationSettings({ provider: 'openai', secret: parsed.data.openai }))
    if (parsed.data.runware) tasks.push(saveAIIntegrationSettings({ provider: 'runware', secret: parsed.data.runware }))
    if (parsed.data.ollamaBaseUrl !== undefined) {
      tasks.push(saveAIIntegrationSettings({
        provider: 'ollama',
        baseUrl: parsed.data.ollamaBaseUrl || 'http://localhost:11434',
      }))
    }

    await Promise.all(tasks)
    return NextResponse.json({ success: true, data: await getAIIntegrationStatus() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save settings'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
