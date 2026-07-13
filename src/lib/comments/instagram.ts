import type { CommentFetchResult } from './types'

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

async function fetchGraphJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  const text = await response.text()

  let payload: Record<string, unknown> = {}
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const errorRecord =
      payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
        ? (payload.error as Record<string, unknown>)
        : {}
    const message =
      (typeof errorRecord.message === 'string' && errorRecord.message) ||
      text ||
      `HTTP ${response.status}`
    throw new Error(`Instagram Graph API error: ${message}`)
  }

  return payload
}

interface RawIgComment {
  id?: string
  text?: string
  username?: string
  timestamp?: string
}

interface RawIgMedia {
  id?: string
  caption?: string
  timestamp?: string
  permalink?: string
  comments?: { data?: RawIgComment[] }
}

export async function fetchInstagramComments(params: {
  igUserId: string
  accessToken: string
  limit?: number
}): Promise<CommentFetchResult[]> {
  try {
    const limit = params.limit ?? 10
    const url =
      `${GRAPH_BASE}/${params.igUserId}/media` +
      `?fields=id,caption,timestamp,permalink,comments{id,text,username,timestamp}` +
      `&limit=${limit}` +
      `&access_token=${encodeURIComponent(params.accessToken)}`

    const payload = await fetchGraphJson(url)
    const rawMedia = Array.isArray(payload.data)
      ? (payload.data as RawIgMedia[])
      : []

    return rawMedia
      .filter((media) => media.id != null)
      .map((media): CommentFetchResult => {
        const postUrl =
          media.permalink ??
          `https://www.instagram.com/p/${media.id}/`

        const rawComments = media.comments?.data ?? []
        const comments = rawComments.flatMap((c): CommentFetchResult['comments'] => {
          if (!c.id || !c.text) return []
          return [
            {
              commentId: c.id,
              text: c.text,
              authorName: c.username ?? 'Unknown',
              authorHandle: c.username,
              createdAt: c.timestamp,
            },
          ]
        })

        return {
          platform: 'INSTAGRAM',
          postUrl,
          postContent: media.caption,
          comments,
        }
      })
      .filter((r) => r.comments.length > 0)
  } catch {
    return []
  }
}
