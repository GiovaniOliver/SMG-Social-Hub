import type { PublishParams, PublishResult } from './types'

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

function buildPostUrl(pageId: string, postId: string): string {
  if (!postId) return ''
  const suffix = postId.includes('_')
    ? postId.split('_').slice(1).join('_')
    : postId
  return suffix ? `https://www.facebook.com/${pageId}/posts/${suffix}` : ''
}

async function parseGraphResponse(response: Response, endpoint: string): Promise<Record<string, unknown>> {
  const text = await response.text()
  let payload: Record<string, unknown> = {}

  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    payload = text ? { raw: text } : {}
  }

  if (!response.ok) {
    const errorRecord =
      payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
        ? (payload.error as Record<string, unknown>)
        : {}
    const message =
      (typeof errorRecord.message === 'string' && errorRecord.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      text ||
      `HTTP ${response.status}`
    throw new Error(`Facebook Graph API ${endpoint} failed: ${response.status} — ${message}`)
  }

  return payload
}

function detectMediaKind(mediaUrl: string): 'image' | 'video' {
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrl)) return 'video'
  return 'image'
}

async function publishText(params: {
  pageId: string
  accessToken: string
  message: string
}): Promise<{ postId: string; postUrl: string }> {
  const endpoint = `${GRAPH_BASE}/${params.pageId}/feed`
  const body = new URLSearchParams()
  body.set('access_token', params.accessToken)
  body.set('message', params.message)

  const response = await fetch(endpoint, { method: 'POST', body })
  const payload = await parseGraphResponse(response, endpoint)

  const postId = typeof payload.id === 'string' ? payload.id : ''
  if (!postId) {
    throw new Error(`Facebook Graph API ${endpoint} did not return a post ID.`)
  }

  return { postId, postUrl: buildPostUrl(params.pageId, postId) }
}

async function publishMedia(params: {
  pageId: string
  accessToken: string
  message: string
  mediaUrl: string
  mediaKind: 'image' | 'video'
}): Promise<{ postId: string; postUrl: string }> {
  const endpointPath = params.mediaKind === 'video' ? 'videos' : 'photos'
  const endpoint = `${GRAPH_BASE}/${params.pageId}/${endpointPath}`

  const form = new FormData()
  form.append('access_token', params.accessToken)

  if (params.message) {
    form.append(params.mediaKind === 'video' ? 'description' : 'message', params.message)
  }

  if (params.mediaKind === 'image') {
    form.append('url', params.mediaUrl)
    form.append('published', 'true')
  } else {
    form.append('file_url', params.mediaUrl)
  }

  const response = await fetch(endpoint, { method: 'POST', body: form })
  const payload = await parseGraphResponse(response, endpoint)

  const postId =
    (typeof payload.post_id === 'string' && payload.post_id) ||
    (typeof payload.id === 'string' && payload.id) ||
    ''

  if (!postId) {
    throw new Error(`Facebook Graph API ${endpoint} did not return a post ID.`)
  }

  return { postId, postUrl: buildPostUrl(params.pageId, postId) }
}

export async function publishToFacebook(params: PublishParams): Promise<PublishResult> {
  const pageId = params.accountId?.trim() ?? ''

  if (!pageId) {
    return {
      success: false,
      error: 'Facebook Page ID (accountId) is required.',
    }
  }

  if (!params.accessToken?.trim()) {
    return {
      success: false,
      error: 'Facebook access token is required.',
    }
  }

  if (!params.content?.trim() && !params.mediaUrls?.length) {
    return {
      success: false,
      error: 'Facebook post requires content text or a media URL.',
    }
  }

  try {
    const firstMediaUrl = params.mediaUrls?.[0]?.trim() ?? ''

    if (!firstMediaUrl) {
      const { postId, postUrl } = await publishText({
        pageId,
        accessToken: params.accessToken,
        message: params.content,
      })
      return { success: true, postId, postUrl }
    }

    const mediaKind = detectMediaKind(firstMediaUrl)
    const { postId, postUrl } = await publishMedia({
      pageId,
      accessToken: params.accessToken,
      message: params.content,
      mediaUrl: firstMediaUrl,
      mediaKind,
    })

    return { success: true, postId, postUrl }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
