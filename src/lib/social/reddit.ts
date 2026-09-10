import type { PublishParams, PublishResult } from './types'
import { executeArcadeTool, getArcadeExecutionValue } from '@/lib/arcade'

const TOOL_NAME = 'Reddit.SubmitTextPost'

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export async function publishToReddit(
  params: PublishParams & { arcadeApiKey: string; userId: string },
): Promise<PublishResult> {
  if (!params.arcadeApiKey?.trim()) {
    return { success: false, error: 'Arcade API key is required for Reddit publishing.' }
  }

  if (!params.userId?.trim()) {
    return { success: false, error: 'Arcade user ID is required for Reddit publishing.' }
  }

  if (!params.content?.trim()) {
    return { success: false, error: 'Reddit post content cannot be empty.' }
  }

  if (!params.subreddit?.trim()) {
    return { success: false, error: 'Subreddit name is required for Reddit publishing.' }
  }

  const postTitle = params.title?.trim() || params.content.slice(0, 100)

  try {
    const execution = await executeArcadeTool({
      toolName: TOOL_NAME,
      userId: params.userId,
      toolInput: {
        subreddit: params.subreddit.replace(/^r\//, ''),
        title: postTitle,
        body: params.content,
      },
    })

    const auth = execution.output?.authorization
    if (auth?.status !== 'completed' && auth?.url) {
      return {
        success: false,
        requiresAuth: true,
        authUrl: auth.url,
        error: 'Reddit authorization needs to be completed before publishing.',
      }
    }

    const value = getArcadeExecutionValue(execution)
    const record = recordOf(value)
    const nested = recordOf(record?.data)
    const source = nested || record

    const postId =
      (typeof source?.post_id === 'string' && source.post_id) ||
      (typeof source?.id === 'string' && source.id) ||
      undefined
    const postUrl =
      (typeof source?.url === 'string' && source.url) ||
      (typeof source?.permalink === 'string' && source.permalink) ||
      undefined

    return { success: true, postId, postUrl }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Arcade Reddit publishing failed.',
    }
  }
}
