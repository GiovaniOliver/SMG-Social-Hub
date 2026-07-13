import type { PublishParams, PublishResult } from './types'

const ARCADE_BASE_URL = process.env.ARCADE_BASE_URL || 'https://api.arcade.dev/v1'
const TOOL_NAME = 'Twitter.CreatePost'

interface ArcadeRunResponse {
  status?: string
  output?: Record<string, unknown>
  authorization?: {
    url?: string
  }
  error?: string
}

export async function publishToTwitter(
  params: PublishParams & { arcadeApiKey: string; userId: string },
): Promise<PublishResult> {
  if (!params.arcadeApiKey?.trim()) {
    return { success: false, error: 'Arcade API key is required for Twitter publishing.' }
  }

  if (!params.userId?.trim()) {
    return { success: false, error: 'User ID is required for Twitter publishing via Arcade.' }
  }

  if (!params.content?.trim()) {
    return { success: false, error: 'Tweet content cannot be empty.' }
  }

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
        input: { tweet: params.content },
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

  // Auth required — user must authorize via Arcade
  const authUrl = data.authorization?.url
  if (authUrl) {
    return {
      success: false,
      requiresAuth: true,
      authUrl,
      error: 'Twitter authorization required. Redirect the user to the authUrl to connect their account.',
    }
  }

  if (!response.ok || data.status === 'error') {
    return {
      success: false,
      error: data.error || `Arcade Twitter.CreatePost failed with HTTP ${response.status}.`,
    }
  }

  const tweetId =
    (typeof data.output?.tweet_id === 'string' && data.output.tweet_id) ||
    (typeof data.output?.id === 'string' && data.output.id) ||
    ''

  return {
    success: true,
    postId: tweetId || undefined,
  }
}
