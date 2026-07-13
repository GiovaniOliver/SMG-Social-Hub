import type { CommentFetchResult } from './types'

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2'
const LINKEDIN_VERSION = '202312'

async function fetchLinkedInJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
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
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      text ||
      `HTTP ${response.status}`
    throw new Error(`LinkedIn API error: ${message}`)
  }

  return payload
}

interface RawLinkedInComment {
  id?: string
  message?: { text?: string }
  actor?: string                 // URN like "urn:li:person:XXXX"
  created?: { time?: number }
}

function extractPersonId(actorUrn: string | undefined): string {
  if (!actorUrn) return 'unknown'
  const parts = actorUrn.split(':')
  return parts[parts.length - 1] ?? actorUrn
}

export async function fetchLinkedInComments(params: {
  accessToken: string
  postUrn?: string
  limit?: number
}): Promise<CommentFetchResult> {
  const postUrn = params.postUrn ?? ''
  const empty: CommentFetchResult = {
    platform: 'LINKEDIN',
    postUrl: postUrn
      ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`
      : 'https://www.linkedin.com',
    comments: [],
  }

  if (!postUrn) return empty

  try {
    const limit = params.limit ?? 50
    const encodedUrn = encodeURIComponent(postUrn)
    const url =
      `${LINKEDIN_API_BASE}/socialActions/${encodedUrn}/comments` +
      `?count=${limit}`

    const payload = await fetchLinkedInJson(url, params.accessToken)
    const rawElements = Array.isArray(payload.elements)
      ? (payload.elements as RawLinkedInComment[])
      : []

    const comments = rawElements.flatMap((el): CommentFetchResult['comments'] => {
      const text = el.message?.text
      if (!el.id || !text) return []
      return [
        {
          commentId: el.id,
          text,
          authorName: extractPersonId(el.actor),
          authorHandle: el.actor,
          createdAt: el.created?.time
            ? new Date(el.created.time).toISOString()
            : undefined,
        },
      ]
    })

    return {
      ...empty,
      postUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`,
      comments,
    }
  } catch {
    return empty
  }
}
