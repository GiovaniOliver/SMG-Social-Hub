import type { PublishParams, PublishResult } from './types'

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2'

interface LinkedInUserInfo {
  sub: string
}

async function fetchLinkedInUserUrn(accessToken: string): Promise<string> {
  const response = await fetch(`${LINKEDIN_API_BASE}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Failed to fetch LinkedIn user info: HTTP ${response.status} — ${text || 'No response body'}`,
    )
  }

  const data = (await response.json()) as LinkedInUserInfo
  const sub = data.sub?.trim() ?? ''

  if (!sub) {
    throw new Error('LinkedIn userinfo response did not contain a "sub" field.')
  }

  return `urn:li:person:${sub}`
}

export async function publishToLinkedIn(params: PublishParams): Promise<PublishResult> {
  if (!params.accessToken?.trim()) {
    return { success: false, error: 'LinkedIn access token is required.' }
  }

  if (!params.content?.trim()) {
    return { success: false, error: 'LinkedIn post content cannot be empty.' }
  }

  try {
    const authorUrn = await fetchLinkedInUserUrn(params.accessToken)

    const ugcPostBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: params.content,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(ugcPostBody),
    })

    if (!response.ok) {
      const text = await response.text()
      let errorMessage = `HTTP ${response.status}`

      try {
        const errorData = JSON.parse(text) as Record<string, unknown>
        errorMessage =
          (typeof errorData.message === 'string' && errorData.message) ||
          (typeof errorData.serviceErrorCode === 'number'
            ? `LinkedIn API error code ${errorData.serviceErrorCode}`
            : errorMessage)
      } catch {
        errorMessage = text || errorMessage
      }

      throw new Error(`LinkedIn ugcPosts failed: ${errorMessage}`)
    }

    const postId = response.headers.get('x-restli-id') ?? ''
    let bodyPostId = ''

    try {
      const responseData = (await response.json()) as Record<string, unknown>
      bodyPostId = typeof responseData.id === 'string' ? responseData.id : ''
    } catch {
      // Response body may be empty on 201 Created — header is the reliable source
    }

    return {
      success: true,
      postId: postId || bodyPostId || undefined,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
