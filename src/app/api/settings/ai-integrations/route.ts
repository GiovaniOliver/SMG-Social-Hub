import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getAIIntegrationStatus,
  saveAIIntegrationSettings,
  setAIIntegrationDefaultProvider,
  type AIProvider,
} from '@/lib/ai/providers'

const providerSchema = z.enum(['gemini', 'anthropic', 'openai', 'ollama', 'runware'])

const updateSchema = z.object({
  provider: providerSchema,
  secret: z.string().optional(),
  clearSecret: z.boolean().optional(),
  defaultModel: z.string().trim().max(200).nullable().optional(),
  baseUrl: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
})

export async function GET() {
  try {
    const status = await getAIIntegrationStatus()
    return NextResponse.json({ success: true, data: status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load AI integrations'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const provider = parsed.data.provider
    const defaultModel =
      provider === 'runware' ? undefined : parsed.data.defaultModel

    await saveAIIntegrationSettings({
      provider,
      secret: parsed.data.secret,
      clearSecret: parsed.data.clearSecret,
      defaultModel,
      baseUrl: provider === 'ollama' ? parsed.data.baseUrl : undefined,
      enabled: parsed.data.enabled,
    })

    const status = await getAIIntegrationStatus()
    return NextResponse.json({ success: true, data: status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save AI integration'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export type { AIProvider }


const defaultProviderSchema = z.object({
  defaultProvider: z.enum(['gemini', 'anthropic', 'openai', 'ollama']),
})

export async function PUT(req: NextRequest) {
  try {
    const parsed = defaultProviderSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    await setAIIntegrationDefaultProvider(parsed.data.defaultProvider)
    return NextResponse.json({ success: true, data: await getAIIntegrationStatus() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update default AI provider'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
