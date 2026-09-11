import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateText, getProviderSecret } from '@/lib/ai/providers'

const schema = z.object({
  provider: z.enum(['gemini', 'anthropic', 'openai', 'ollama', 'runware']),
})

async function testRunware(): Promise<void> {
  const apiKey = await getProviderSecret('runware')
  if (!apiKey) throw new Error('Runware API key is not configured')

  const response = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify([
      {
        taskType: 'accountManagement',
        taskUUID: crypto.randomUUID(),
        operation: 'getDetails',
      },
    ]),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Runware connection failed (${response.status})`)
  }

  const payload = (await response.json()) as { errors?: unknown[] }
  if (payload.errors?.length) {
    throw new Error('Runware rejected the configured credential')
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now()

  try {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid provider' },
        { status: 400 }
      )
    }

    if (parsed.data.provider === 'runware') {
      await testRunware()
    } else {
      const output = await generateText('Reply with exactly: OK', {
        provider: parsed.data.provider,
        maxTokens: 16,
      })
      if (!output.trim()) throw new Error('Provider returned an empty response')
    }

    return NextResponse.json({
      success: true,
      data: {
        provider: parsed.data.provider,
        latencyMs: Date.now() - started,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider test failed'
    return NextResponse.json(
      {
        success: false,
        error: message,
        data: { latencyMs: Date.now() - started },
      },
      { status: 502 }
    )
  }
}
