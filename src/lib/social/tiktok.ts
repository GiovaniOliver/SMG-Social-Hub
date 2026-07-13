import type { PublishParams, PublishResult } from './types'

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

interface TikTokInitResponse {
  data?: {
    publish_id?: string
    error?: {
      code?: string
      message?: string
    }
  }
  error?: {
    code?: string
    message?: string
  }
}

export async function publishToTikTok(params: PublishParams): Promise<PublishResult> {
  if (!params.accessToken?.trim()) {
    return { success: false, error: 'TikTok access token is required.' }
  }

  const videoUrl = params.mediaUrls?.[0]?.trim() ?? ''

  if (!videoUrl) {
    return {
      success: false,
      error:
        'TikTok requires a publicly accessible video URL. ' +
        'Text-only and image posts are not supported by the TikTok Content Posting API v2.',
    }
  }

  if (!/\.(mp4|mov|webm|m4v)(\?|$)/i.test(videoUrl)) {
    return {
      success: false,
      error:
        'TikTok only accepts video files (mp4, mov, webm, m4v). ' +
        'The provided URL does not appear to be a video.',
    }
  }

  const endpoint = `${TIKTOK_API_BASE}/post/publish/video/init/`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: params.content,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          video_cover_timestamp_ms: 0,
        },
        source_info: {
          source: 'URL_UPLOAD',
          video_url: videoUrl,
        },
      }),
    })
  } catch (networkError) {
    return {
      success: false,
      error: `Network error reaching TikTok API: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
    }
  }

  let data: TikTokInitResponse
  try {
    data = (await response.json()) as TikTokInitResponse
  } catch {
    return {
      success: false,
      error: `TikTok API returned an unparseable response (HTTP ${response.status}).`,
    }
  }

  if (!response.ok) {
    const errorCode = data.error?.code || data.data?.error?.code || ''
    const errorMessage =
      data.error?.message ||
      data.data?.error?.message ||
      `TikTok API error HTTP ${response.status}`
    return {
      success: false,
      error: errorCode ? `TikTok error [${errorCode}]: ${errorMessage}` : errorMessage,
    }
  }

  const publishId = data.data?.publish_id?.trim() ?? ''

  if (!publishId) {
    return {
      success: false,
      error: 'TikTok API did not return a publish_id. The upload may have been queued but confirmation is unavailable.',
    }
  }

  return {
    success: true,
    postId: publishId,
  }
}
