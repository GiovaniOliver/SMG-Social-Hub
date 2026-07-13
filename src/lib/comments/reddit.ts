import type { CommentFetchResult } from './types'

const ARCADE_API_BASE = 'https://api.arcade.dev/v1'
const REDDIT_PUBLIC_API = 'https://www.reddit.com'

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

interface RedditPost {
  data?: {
    id?: string
    title?: string
    selftext?: string
    permalink?: string
    subreddit?: string
    author?: string
    url?: string
    created_utc?: number
    num_comments?: number
  }
}

interface RedditPublicSearchResponse {
  data?: {
    children?: RedditPost[]
  }
}

async function searchRedditPublic(params: {
  keywords: string[]
  subreddits?: string[]
  limit?: number
}): Promise<CommentFetchResult[]> {
  const query = params.keywords.join(' ')
  const limit = params.limit ?? 25

  const subredditResults: CommentFetchResult[] = []

  const targets =
    params.subreddits && params.subreddits.length > 0
      ? params.subreddits
      : [null]

  for (const subreddit of targets) {
    try {
      const base = subreddit
        ? `${REDDIT_PUBLIC_API}/r/${subreddit}/search.json`
        : `${REDDIT_PUBLIC_API}/search.json`

      const url =
        `${base}?q=${encodeURIComponent(query)}` +
        `&sort=new` +
        `&limit=${limit}` +
        `&type=link` +
        (subreddit ? `&restrict_sr=1` : '')

      const response = await fetch(url, {
        headers: { 'User-Agent': 'SMGSocialHub/1.0' },
      })

      if (!response.ok) continue

      const json = (await response.json()) as RedditPublicSearchResponse
      const posts = json.data?.children ?? []

      for (const post of posts) {
        const d = post.data
        if (!d?.id) continue

        const postUrl = d.permalink
          ? `https://www.reddit.com${d.permalink}`
          : `https://www.reddit.com/${d.id}`

        subredditResults.push({
          platform: 'REDDIT',
          postUrl,
          postTitle: d.title,
          postContent: d.selftext || undefined,
          comments: [
            {
              commentId: d.id,
              text: d.title ?? '',
              authorName: d.author ?? 'Unknown',
              authorHandle: d.author ? `u/${d.author}` : undefined,
              createdAt: d.created_utc
                ? new Date(d.created_utc * 1000).toISOString()
                : undefined,
            },
          ],
        })
      }
    } catch {
      // Skip failed subreddit — continue to next
    }
  }

  return subredditResults
}

async function searchRedditViaArcade(params: {
  keywords: string[]
  subreddits?: string[]
  arcadeApiKey: string
  userId: string
  limit?: number
}): Promise<CommentFetchResult[]> {
  const query = params.keywords.join(' ')
  const limit = params.limit ?? 25

  const toolInput: Record<string, unknown> = {
    query,
    limit,
  }

  if (params.subreddits && params.subreddits.length > 0) {
    toolInput.subreddit = params.subreddits[0]
  }

  const payload = await callArcadeTool(
    'Reddit.SearchPosts',
    toolInput,
    params.arcadeApiKey,
    params.userId
  )

  const output = payload.output ?? payload.result ?? payload
  const posts = Array.isArray(output)
    ? (output as Array<Record<string, unknown>>)
    : []

  return posts.flatMap((post): CommentFetchResult[] => {
    const id = String(post.id ?? post.post_id ?? '')
    const permalink = String(post.permalink ?? post.url ?? '')
    const postUrl = permalink.startsWith('http')
      ? permalink
      : permalink
        ? `https://www.reddit.com${permalink}`
        : id
          ? `https://www.reddit.com/${id}`
          : ''

    if (!postUrl) return []

    const title = String(post.title ?? '')
    const text = String(post.selftext ?? post.body ?? post.content ?? title)
    const author = String(post.author ?? post.author_name ?? 'Unknown')

    return [
      {
        platform: 'REDDIT',
        postUrl,
        postTitle: title || undefined,
        postContent: text || undefined,
        comments: [
          {
            commentId: id || postUrl,
            text: title || text,
            authorName: author,
            authorHandle: author !== 'Unknown' ? `u/${author}` : undefined,
          },
        ],
      },
    ]
  })
}

export async function searchRedditComments(params: {
  keywords: string[]
  subreddits?: string[]
  arcadeApiKey: string
  userId: string
  limit?: number
}): Promise<CommentFetchResult[]> {
  try {
    // Try Arcade first; fall back to public Reddit API
    const arcadeResults = await searchRedditViaArcade(params)
    if (arcadeResults.length > 0) return arcadeResults
  } catch {
    // Arcade unavailable or auth required — fall through to public API
  }

  try {
    return await searchRedditPublic(params)
  } catch {
    return []
  }
}
