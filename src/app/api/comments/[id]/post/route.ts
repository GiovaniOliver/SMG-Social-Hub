import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import type { ApiResponse } from '@/types'

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`
const ARCADE_API_BASE = 'https://api.arcade.dev/v1'

async function getConnectionToken(
  brandId: string,
  platform: string
): Promise<{ accessToken: string; accountId: string | null } | null> {
  const connection = await db.platformConnection.findUnique({
    where: { brandId_platform: { brandId, platform } },
  })

  if (!connection || !connection.isActive) return null

  try {
    const accessToken = decrypt(connection.accessToken)
    return { accessToken, accountId: connection.accountId }
  } catch {
    return null
  }
}

async function postToGraphApi(
  endpoint: string,
  accessToken: string,
  body: Record<string, string>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const form = new URLSearchParams()
  form.set('access_token', accessToken)
  for (const [key, value] of Object.entries(body)) {
    form.set(key, value)
  }

  const response = await fetch(endpoint, { method: 'POST', body: form })
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
    return { success: false, error: message }
  }

  return {
    success: true,
    id: typeof payload.id === 'string' ? payload.id : undefined,
  }
}

async function callArcadeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const arcadeApiKey = process.env.ARCADE_API_KEY
  const arcadeUserId = process.env.ARCADE_USER_ID

  if (!arcadeApiKey || !arcadeUserId) {
    return { success: false, error: 'Arcade API not configured' }
  }

  const response = await fetch(`${ARCADE_API_BASE}/tools/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arcadeApiKey}`,
    },
    body: JSON.stringify({
      tool_name: toolName,
      tool_input: toolInput,
      user_id: arcadeUserId,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || `HTTP ${response.status}` }
  }

  return { success: true }
}

async function postFacebookReply(
  commentId: string | null,
  postUrl: string,
  replyText: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  if (commentId) {
    const endpoint = `${GRAPH_BASE}/${commentId}/comments`
    return postToGraphApi(endpoint, accessToken, { message: replyText })
  }

  const postIdMatch = postUrl.match(/\/posts\/(\d+)/)
  if (!postIdMatch) {
    return { success: false, error: 'Cannot extract post ID from URL to reply' }
  }

  const endpoint = `${GRAPH_BASE}/${postIdMatch[1]}/comments`
  return postToGraphApi(endpoint, accessToken, { message: replyText })
}

async function postInstagramReply(
  commentId: string | null,
  replyText: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  if (!commentId) {
    return { success: false, error: 'Instagram requires a commentId to reply' }
  }

  const endpoint = `${GRAPH_BASE}/${commentId}/replies`
  return postToGraphApi(endpoint, accessToken, { message: replyText })
}

async function postLinkedInComment(
  postUrl: string,
  replyText: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  const urnMatch = postUrl.match(/urn:li:[^/?\s]+/i)
  if (!urnMatch) {
    return { success: false, error: 'Cannot extract LinkedIn URN from post URL' }
  }

  const postUrn = urnMatch[0]
  const encodedUrn = encodeURIComponent(postUrn)

  const response = await fetch(
    `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202312',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ message: { text: replyText } }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || `HTTP ${response.status}` }
  }

  return { success: true }
}

async function postYouTubeComment(
  postUrl: string,
  commentId: string | null,
  replyText: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  const videoIdMatch =
    postUrl.match(/[?&]v=([^&#]+)/) ?? postUrl.match(/youtu\.be\/([^?#]+)/)

  if (!videoIdMatch) {
    return { success: false, error: 'Cannot extract YouTube video ID from URL' }
  }

  const videoId = videoIdMatch[1]

  const endpoint = commentId
    ? 'https://www.googleapis.com/youtube/v3/comments?part=snippet'
    : 'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet'

  const body = commentId
    ? {
        snippet: {
          parentId: commentId,
          textOriginal: replyText,
        },
      }
    : {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: { textOriginal: replyText },
          },
        },
      }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || `HTTP ${response.status}` }
  }

  return { success: true }
}

async function postRedditReply(
  commentId: string | null,
  replyText: string
): Promise<{ success: boolean; error?: string }> {
  if (!commentId) {
    return { success: false, error: 'Reddit requires a commentId (thing_id) to reply' }
  }

  return callArcadeTool('Reddit.PostComment', {
    thing_id: commentId,
    text: replyText,
  })
}

async function postTwitterReply(
  commentId: string | null,
  replyText: string
): Promise<{ success: boolean; error?: string }> {
  if (!commentId) {
    return { success: false, error: 'Twitter requires a tweet ID to reply' }
  }

  return callArcadeTool('Twitter.ReplyToTweet', {
    tweet_id: commentId,
    text: replyText,
  })
}

async function postTikTokComment(
  commentId: string | null,
  postUrl: string,
  replyText: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  const videoIdMatch = postUrl.match(/\/video\/(\d+)/)
  if (!videoIdMatch) {
    return { success: false, error: 'Cannot extract TikTok video ID from URL' }
  }

  const videoId = videoIdMatch[1]
  const body: Record<string, unknown> = {
    video_id: videoId,
    text: replyText,
  }

  if (commentId) {
    body.parent_comment_id = commentId
  }

  const response = await fetch('https://open.tiktokapis.com/v2/video/comment/post/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || `HTTP ${response.status}` }
  }

  return { success: true }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  void request
  const { id } = await params

  try {
    const opportunity = await db.commentOpportunity.findUnique({
      where: { id },
    })

    if (!opportunity) {
      const response: ApiResponse<never> = { success: false, error: 'Opportunity not found' }
      return NextResponse.json(response, { status: 404 })
    }

    if (opportunity.status === 'POSTED') {
      const response: ApiResponse<never> = {
        success: false,
        error: 'This reply has already been posted',
      }
      return NextResponse.json(response, { status: 409 })
    }

    if (opportunity.status !== 'APPROVED') {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Reply must be approved before posting',
      }
      return NextResponse.json(response, { status: 409 })
    }

    const replyText = opportunity.approvedReply?.trim()
    if (!replyText) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Approved reply is missing',
      }
      return NextResponse.json(response, { status: 409 })
    }

    const { platform, brandId, isOwned, commentId, postUrl } = opportunity

    // External (not owned) channels cannot be auto-posted — mark the already
    // approved reply as manually posted. The client can copy approvedReply.
    if (!isOwned) {
      const updated = await db.commentOpportunity.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
        },
      })

      const response: ApiResponse<{ opportunity: typeof updated; manualPost: boolean }> = {
        success: true,
        data: { opportunity: updated, manualPost: true },
      }
      return NextResponse.json(response)
    }

    const conn = await getConnectionToken(brandId, platform)
    if (!conn) {
      const response: ApiResponse<never> = {
        success: false,
        error: `No active connection found for platform ${platform}`,
      }
      return NextResponse.json(response, { status: 422 })
    }

    let platformResult: { success: boolean; error?: string }

    switch (platform) {
      case 'FACEBOOK':
        platformResult = await postFacebookReply(commentId, postUrl, replyText, conn.accessToken)
        break
      case 'INSTAGRAM':
        platformResult = await postInstagramReply(commentId, replyText, conn.accessToken)
        break
      case 'LINKEDIN':
        platformResult = await postLinkedInComment(postUrl, replyText, conn.accessToken)
        break
      case 'YOUTUBE':
        platformResult = await postYouTubeComment(postUrl, commentId, replyText, conn.accessToken)
        break
      case 'REDDIT':
        platformResult = await postRedditReply(commentId, replyText)
        break
      case 'TWITTER':
        platformResult = await postTwitterReply(commentId, replyText)
        break
      case 'TIKTOK':
        platformResult = await postTikTokComment(commentId, postUrl, replyText, conn.accessToken)
        break
      default:
        platformResult = { success: false, error: `Unsupported platform: ${platform}` }
    }

    if (!platformResult.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: platformResult.error ?? 'Platform post failed',
      }
      return NextResponse.json(response, { status: 502 })
    }

    const updated = await db.commentOpportunity.update({
      where: { id },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
      },
    })

    const response: ApiResponse<typeof updated> = { success: true, data: updated }
    return NextResponse.json(response)
  } catch (error) {
    const response: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post reply',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
