import type { PublishParams, PublishResult } from './types'
import { executeArcadeTool, getArcadeExecutionValue } from '@/lib/arcade'

const TOOL_NAME = 'X.PostTweet'

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export async function publishToTwitter(
  params: PublishParams & { arcadeApiKey: string; userId: string },
): Promise<PublishResult> {
  if (!params.arcadeApiKey?.trim()) {
    return { success: false, error: 'Arcade API key is required for X publishing.' }
  }

  if (!params.userId?.trim()) {
    return { success: false, error: 'Arcade user ID is required for X publishing.' }
  }

  if (!params.content?.trim()) {
    return { success: false, error: 'Post content cannot be empty.' }
  }

  try {
    const execution = await executeArcadeTool({
      toolName: TOOL_NAME,
      userId: params.userId,
      toolInput: { text: params.content },
    })

    const auth = execution.output?.authorization
    if (auth?.status !== 'completed' && auth?.url) {
      return {
        success: false,
        requiresAuth: true,
        authUrl: auth.url,
        error: 'X authorization needs to be completed before publishing.',
      }
    }

    const value = getArcadeExecutionValue(execution)
    const record = recordOf(value)
    const nested = recordOf(record?.data)
    const source = nested || record

    const postId =
      (typeof source?.tweet_id === 'string' && source.tweet_id) ||
      (typeof source?.id === 'string' && source.id) ||
      undefined
    const postUrl =
      (typeof source?.tweet_url === 'string' && source.tweet_url) ||
      (typeof source?.url === 'string' && source.url) ||
      undefined

    return { success: true, postId, postUrl }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Arcade X publishing failed.',
    }
  }
}
