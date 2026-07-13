import type { CommentFetchResult } from './types'

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

function extractPostIdFromUrl(postUrl: string): string | null {
  // Handles URLs like:
  // https://www.facebook.com/groups/{groupId}/posts/{postId}/
  // https://www.facebook.com/{pageSlug}/posts/{postId}
  // https://www.facebook.com/permalink.php?story_fbid={postId}&id={pageId}
  const groupMatch = postUrl.match(/\/posts\/(\d+)/)
  if (groupMatch) return groupMatch[1]

  const permalinkMatch = postUrl.match(/story_fbid=(\d+)/)
  if (permalinkMatch) return permalinkMatch[1]

  return null
}

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
    throw new Error(`Facebook Graph API error: ${message}`)
  }

  return payload
}

interface RawFbComment {
  id?: string
  message?: string
  from?: { id?: string; name?: string }
  created_time?: string
}

interface RawFbPost {
  id?: string
  message?: string
  name?: string
  story?: string
  comments?: { data?: RawFbComment[] }
}

function mapComment(raw: RawFbComment): CommentFetchResult['comments'][number] | null {
  if (!raw.id || !raw.message) return null
  return {
    commentId: raw.id,
    text: raw.message,
    authorName: raw.from?.name ?? 'Unknown',
    authorHandle: raw.from?.id,
    createdAt: raw.created_time,
  }
}

export async function fetchFacebookPostComments(params: {
  postUrl: string
  accessToken: string
  pageId: string
  limit?: number
}): Promise<CommentFetchResult> {
  const empty: CommentFetchResult = {
    platform: 'FACEBOOK',
    postUrl: params.postUrl,
    comments: [],
  }

  try {
    const postId = extractPostIdFromUrl(params.postUrl)
    if (!postId) return empty

    const limit = params.limit ?? 50
    const url =
      `${GRAPH_BASE}/${postId}/comments` +
      `?fields=id,message,from,created_time` +
      `&limit=${limit}` +
      `&access_token=${encodeURIComponent(params.accessToken)}`

    const payload = await fetchGraphJson(url)
    const rawComments = Array.isArray(payload.data)
      ? (payload.data as RawFbComment[])
      : []

    const comments = rawComments.flatMap((c) => {
      const mapped = mapComment(c)
      return mapped ? [mapped] : []
    })

    return { ...empty, comments }
  } catch {
    return empty
  }
}

export async function fetchFacebookPageComments(params: {
  pageId: string
  accessToken: string
  limit?: number
}): Promise<CommentFetchResult[]> {
  try {
    const limit = params.limit ?? 10
    const url =
      `${GRAPH_BASE}/${params.pageId}/feed` +
      `?fields=id,message,name,story,comments{id,message,from,created_time}` +
      `&limit=${limit}` +
      `&access_token=${encodeURIComponent(params.accessToken)}`

    const payload = await fetchGraphJson(url)
    const rawPosts = Array.isArray(payload.data)
      ? (payload.data as RawFbPost[])
      : []

    return rawPosts
      .filter((post) => post.id != null)
      .map((post): CommentFetchResult => {
        const postIdParts = (post.id ?? '').split('_')
        const postShortId = postIdParts.length > 1 ? postIdParts.slice(1).join('_') : post.id ?? ''
        const postUrl = `https://www.facebook.com/${params.pageId}/posts/${postShortId}`
        const rawComments = post.comments?.data ?? []

        const comments = rawComments.flatMap((c) => {
          const mapped = mapComment(c)
          return mapped ? [mapped] : []
        })

        return {
          platform: 'FACEBOOK',
          postUrl,
          postContent: post.message ?? post.story ?? post.name,
          comments,
        }
      })
      .filter((r) => r.comments.length > 0)
  } catch {
    return []
  }
}
