import type { CommentFetchResult } from './types'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

async function fetchYouTubeJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const errObj =
      payload.error && typeof payload.error === 'object'
        ? (payload.error as Record<string, unknown>)
        : {}
    const message =
      (typeof errObj.message === 'string' && errObj.message) ||
      text ||
      `HTTP ${response.status}`
    throw new Error(`YouTube API error: ${message}`)
  }

  return payload
}

interface RawYtSnippet {
  textDisplay?: string
  authorDisplayName?: string
  authorChannelId?: { value?: string }
  publishedAt?: string
  videoId?: string
}

interface RawYtTopLevelComment {
  id?: string
  snippet?: RawYtSnippet
}

interface RawYtThread {
  id?: string
  snippet?: {
    videoId?: string
    topLevelComment?: RawYtTopLevelComment
  }
}

async function getVideoTitle(videoId: string, accessToken: string): Promise<string | undefined> {
  try {
    const url =
      `${YOUTUBE_API_BASE}/videos?part=snippet&id=${encodeURIComponent(videoId)}`
    const payload = await fetchYouTubeJson(url, accessToken)
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []
    const snippet = items[0]?.snippet as Record<string, unknown> | undefined
    return typeof snippet?.title === 'string' ? snippet.title : undefined
  } catch {
    return undefined
  }
}

async function getLatestVideoId(channelId: string, accessToken: string): Promise<string | null> {
  try {
    const url =
      `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${encodeURIComponent(channelId)}` +
      `&order=date&type=video&maxResults=1`
    const payload = await fetchYouTubeJson(url, accessToken)
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []
    const id = items[0]?.id as Record<string, unknown> | undefined
    return typeof id?.videoId === 'string' ? id.videoId : null
  } catch {
    return null
  }
}

export async function fetchYouTubeComments(params: {
  accessToken: string
  videoId?: string
  channelId?: string
  searchKeywords?: string[]
  limit?: number
}): Promise<CommentFetchResult> {
  let resolvedVideoId = params.videoId

  if (!resolvedVideoId && params.channelId) {
    resolvedVideoId = (await getLatestVideoId(params.channelId, params.accessToken)) ?? undefined
  }

  const postUrl = resolvedVideoId
    ? `https://www.youtube.com/watch?v=${resolvedVideoId}`
    : 'https://www.youtube.com'

  const empty: CommentFetchResult = {
    platform: 'YOUTUBE',
    postUrl,
    comments: [],
  }

  if (!resolvedVideoId) return empty

  try {
    const limit = params.limit ?? 50
    const url =
      `${YOUTUBE_API_BASE}/commentThreads` +
      `?part=snippet` +
      `&videoId=${encodeURIComponent(resolvedVideoId)}` +
      `&maxResults=${limit}` +
      `&order=time`

    const [payload, videoTitle] = await Promise.all([
      fetchYouTubeJson(url, params.accessToken),
      getVideoTitle(resolvedVideoId, params.accessToken),
    ])

    const rawItems = Array.isArray(payload.items)
      ? (payload.items as RawYtThread[])
      : []

    const keywords = (params.searchKeywords ?? []).map((k) => k.toLowerCase())

    const comments = rawItems.flatMap((thread): CommentFetchResult['comments'] => {
      const topComment = thread.snippet?.topLevelComment
      const snippet = topComment?.snippet
      const text = snippet?.textDisplay ?? ''

      if (!topComment?.id || !text) return []

      if (keywords.length > 0 && !keywords.some((k) => text.toLowerCase().includes(k))) {
        return []
      }

      return [
        {
          commentId: topComment.id,
          text,
          authorName: snippet?.authorDisplayName ?? 'Unknown',
          authorHandle: snippet?.authorChannelId?.value,
          createdAt: snippet?.publishedAt,
        },
      ]
    })

    return {
      platform: 'YOUTUBE',
      postUrl,
      postTitle: videoTitle,
      comments,
    }
  } catch {
    return empty
  }
}
