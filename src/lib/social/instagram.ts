import type { PublishParams, PublishResult } from './types'

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

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
    throw new Error(`Instagram Graph API ${endpoint} failed: ${response.status} — ${message}`)
  }

  return payload
}

function detectMediaKind(mediaUrl: string): 'image' | 'video' {
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrl)) return 'video'
  return 'image'
}

async function pollVideoStatus(
  creationId: string,
  accessToken: string,
  maxAttempts = 10,
  intervalMs = 5000,
): Promise<void> {
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts += 1
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))

    const endpoint = `${GRAPH_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`
    const response = await fetch(endpoint)
    const payload = await parseGraphResponse(response, endpoint)
    const statusCode = typeof payload.status_code === 'string' ? payload.status_code : ''

    if (statusCode === 'FINISHED') return
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram video processing failed with status: ${statusCode}`)
    }
    // IN_PROGRESS — continue polling
  }

  throw new Error('Instagram video processing timed out after maximum poll attempts.')
}

export async function publishToInstagram(params: PublishParams): Promise<PublishResult> {
  const igUserId = params.accountId?.trim() ?? ''

  if (!igUserId) {
    return {
      success: false,
      error: 'Instagram Business Account ID (accountId) is required.',
    }
  }

  if (!params.accessToken?.trim()) {
    return {
      success: false,
      error: 'Instagram access token is required.',
    }
  }

  const mediaUrl = params.mediaUrls?.[0]?.trim() ?? ''

  if (!mediaUrl) {
    return {
      success: false,
      error:
        'Instagram Content Publishing API does not support text-only posts. ' +
        'Provide a publicly accessible image or video URL.',
    }
  }

  try {
    const mediaKind = detectMediaKind(mediaUrl)

    // Step 1 — Create media container
    const createEndpoint = `${GRAPH_BASE}/${igUserId}/media`
    const createBody = new URLSearchParams()
    createBody.set('access_token', params.accessToken)
    createBody.set('caption', params.content)

    if (mediaKind === 'video') {
      createBody.set('media_type', 'VIDEO')
      createBody.set('video_url', mediaUrl)
    } else {
      createBody.set('image_url', mediaUrl)
    }

    const createResponse = await fetch(createEndpoint, { method: 'POST', body: createBody })
    const createPayload = await parseGraphResponse(createResponse, createEndpoint)
    const creationId = typeof createPayload.id === 'string' ? createPayload.id : ''

    if (!creationId) {
      throw new Error('Instagram media container creation did not return a container ID.')
    }

    // Step 2 — Poll for video readiness (images are ready immediately)
    if (mediaKind === 'video') {
      await pollVideoStatus(creationId, params.accessToken)
    }

    // Step 3 — Publish the container
    const publishEndpoint = `${GRAPH_BASE}/${igUserId}/media_publish`
    const publishBody = new URLSearchParams()
    publishBody.set('access_token', params.accessToken)
    publishBody.set('creation_id', creationId)

    const publishResponse = await fetch(publishEndpoint, { method: 'POST', body: publishBody })
    const publishPayload = await parseGraphResponse(publishResponse, publishEndpoint)
    const postId = typeof publishPayload.id === 'string' ? publishPayload.id : ''

    return { success: true, postId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
