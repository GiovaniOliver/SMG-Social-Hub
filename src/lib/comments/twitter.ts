import type { CommentFetchResult } from './types'

const ARCADE_API_BASE = 'https://api.arcade.dev/v1'

async function callArcadeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  arcadeApiKey: string,
  userId: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${ARCADE_API_BASE}/tools/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arcadeApiKey}`,
    },
    body: JSON.stringify({
      tool_name: toolName,
      tool_input: toolInput,
      user_id: userId,
    }),
  })

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      text ||
      `HTTP ${response.status}`
    throw new Error(`Arcade API error calling ${toolName}: ${message}`)
  }

  return payload
}

function buildTwitterQuery(keywords: string[]): string {
  return keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' OR ')
}

export async function searchTwitter(params: {
  keywords: string[]
  arcadeApiKey: string
  userId: string
  limit?: number
}): Promise<CommentFetchResult[]> {
  if (params.keywords.length === 0) return []

  try {
    const query = buildTwitterQuery(params.keywords)
    const limit = params.limit ?? 25

    const payload = await callArcadeTool(
      'Twitter.SearchRecentTweets',
      {
        query,
        max_results: limit,
        tweet_fields: 'author_id,created_at,public_metrics,text',
        expansions: 'author_id',
        user_fields: 'username,name',
      },
      params.arcadeApiKey,
      params.userId
    )

    // Arcade may return { output: { data: [...], includes: { users: [...] } } }
    // or { data: [...] } depending on version
    const output =
      (payload.output as Record<string, unknown>) ??
      (payload.result as Record<string, unknown>) ??
      payload

    const tweets = Array.isArray(output?.data)
      ? (output.data as Array<Record<string, unknown>>)
      : Array.isArray(payload.data)
        ? (payload.data as Array<Record<string, unknown>>)
        : []

    const usersArray = Array.isArray(
      (output?.includes as Record<string, unknown> | undefined)?.users
    )
      ? ((output.includes as Record<string, unknown>).users as Array<Record<string, unknown>>)
      : []

    const userMap = new Map<string, { name: string; username: string }>()
    for (const u of usersArray) {
      const id = String(u.id ?? '')
      if (id) {
        userMap.set(id, {
          name: String(u.name ?? 'Unknown'),
          username: String(u.username ?? ''),
        })
      }
    }

    return tweets.flatMap((tweet): CommentFetchResult[] => {
      const id = String(tweet.id ?? '')
      const text = String(tweet.text ?? '')
      if (!id || !text) return []

      const authorId = String(tweet.author_id ?? '')
      const user = userMap.get(authorId)
      const authorName = user?.name ?? 'Unknown'
      const authorHandle = user?.username ? `@${user.username}` : undefined
      const createdAt = typeof tweet.created_at === 'string' ? tweet.created_at : undefined

      const tweetUrl = user?.username
        ? `https://twitter.com/${user.username}/status/${id}`
        : `https://twitter.com/i/web/status/${id}`

      return [
        {
          platform: 'TWITTER',
          postUrl: tweetUrl,
          comments: [
            {
              commentId: id,
              text,
              authorName,
              authorHandle,
              createdAt,
            },
          ],
        },
      ]
    })
  } catch {
    return []
  }
}
