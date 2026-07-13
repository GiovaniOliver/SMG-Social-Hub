import type { CommentFetchResult } from './types'

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

async function fetchTikTokJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
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
    throw new Error(`TikTok API error: ${message}`)
  }

  return payload
}

interface RawTikTokComment {
  id?: string
  text?: string
  like_count?: number
  create_time?: number
  username?: string
}

export async function fetchTikTokComments(params: {
  accessToken: string
  videoId: string
  limit?: number
}): Promise<CommentFetchResult> {
  const postUrl = `https://www.tiktok.com/@video/video/${params.videoId}`
  const empty: CommentFetchResult = {
    platform: 'TIKTOK',
    postUrl,
    comments: [],
  }

  if (!params.videoId) return empty

  try {
    const maxCount = Math.min(params.limit ?? 50, 100)
    const fields = 'id,text,like_count,create_time,username'
    const url =
      `${TIKTOK_API_BASE}/video/comment/list/` +
      `?fields=${encodeURIComponent(fields)}` +
      `&video_id=${encodeURIComponent(params.videoId)}` +
      `&max_count=${maxCount}`

    const payload = await fetchTikTokJson(url, params.accessToken)

    // TikTok wraps response in { data: { comments: [...] } }
    const dataObj =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : {}

    const rawComments = Array.isArray(dataObj.comments)
      ? (dataObj.comments as RawTikTokComment[])
      : Array.isArray(payload.comments)
        ? (payload.comments as RawTikTokComment[])
        : []

    const comments = rawComments.flatMap((c): CommentFetchResult['comments'] => {
      if (!c.id || !c.text) return []
      return [
        {
          commentId: c.id,
          text: c.text,
          authorName: c.username ?? 'Unknown',
          authorHandle: c.username ? `@${c.username}` : undefined,
          createdAt: c.create_time
            ? new Date(c.create_time * 1000).toISOString()
            : undefined,
        },
      ]
    })

    return { ...empty, comments }
  } catch {
    return empty
  }
}
