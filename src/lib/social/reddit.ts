import type { PublishParams, PublishResult } from './types'

const ARCADE_BASE_URL = process.env.ARCADE_BASE_URL || 'https://api.arcade.dev/v1'
const TOOL_NAME = 'Reddit.SubmitPost'

interface ArcadeRunResponse {
  status?: string
  output?: Record<string, unknown>
  authorization?: {
    url?: string
  }
  error?: string
}

export async function publishToReddit(
  params: PublishParams & { arcadeApiKey: string; userId: string },
): Promise<PublishResult> {
  if (!params.arcadeApiKey?.trim()) {
    return { success: false, error: 'Arcade API key is required for Reddit publishing.' }
  }

  if (!params.userId?.trim()) {
    return { success: false, error: 'User ID is required for Reddit publishing via Arcade.' }
  }

  if (!params.content?.trim()) {
    return { success: false, error: 'Reddit post content cannot be empty.' }
  }

  if (!params.subreddit?.trim()) {
    return { success: false, error: 'Subreddit name is required for Reddit publishing.' }
  }

  const postTitle = params.title?.trim() || params.content.slice(0, 100)

  const endpoint = `${ARCADE_BASE_URL}/tools/${TOOL_NAME}/run`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.arcadeApiKey}`,
      },
      body: JSON.stringify({
        tool_name: TOOL_NAME,
        input: {
          subreddit_name: params.subreddit,
          title: postTitle,
          text_content: params.content,
        },
        user_id: params.userId,
      }),
    })
  } catch (networkError) {
    return {
      success: false,
      error: `Network error reaching Arcade API: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
    }
  }

  let data: ArcadeRunResponse
  try {
    data = (await response.json()) as ArcadeRunResponse
  } catch {
    return {
      success: false,
      error: `Arcade API returned an unparseable response (HTTP ${response.status}).`,
    }
  }

  // Auth required
  const authUrl = data.authorization?.url
  if (authUrl) {
    return {
      success: false,
      requiresAuth: true,
      authUrl,
      error: 'Reddit authorization required. Redirect the user to the authUrl to connect their account.',
    }
  }

  if (!response.ok || data.status === 'error') {
    return {
      success: false,
      error: data.error || `Arcade Reddit.SubmitPost failed with HTTP ${response.status}.`,
    }
  }

  const postId =
    (typeof data.output?.post_id === 'string' && data.output.post_id) ||
    (typeof data.output?.id === 'string' && data.output.id) ||
    ''

  const postUrl =
    typeof data.output?.url === 'string' ? data.output.url : undefined

  return {
    success: true,
    postId: postId || undefined,
    postUrl,
  }
}
