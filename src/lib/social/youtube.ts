import type { PublishParams, PublishResult } from './types'

/**
 * YouTube Data API v3 — Publishing
 *
 * YouTube requires video file upload via OAuth with the
 * "https://www.googleapis.com/auth/youtube.upload" scope.
 * The API does not accept a remote video URL — the file must be
 * streamed directly from the uploading server.
 *
 * For SMG Social Hub: guide users to YouTube Studio for initial upload.
 * Once a video exists on the channel, its URL can be stored as a reference.
 */
export async function publishToYouTube(params: PublishParams): Promise<PublishResult> {
  if (!params.accessToken?.trim()) {
    return { success: false, error: 'YouTube access token is required.' }
  }

  // YouTube does not support direct URL uploads. The Data API v3 resumable
  // upload endpoint requires the video binary streamed from the caller.
  // Attempting to pass a remote video URL as the upload body results in an
  // empty or corrupt upload on YouTube's end.
  return {
    success: false,
    error:
      'YouTube requires a video file upload, not a URL. ' +
      'The YouTube Data API v3 does not support importing video from a remote URL — ' +
      'the video binary must be streamed directly. ' +
      'Please upload the video via YouTube Studio (https://studio.youtube.com), ' +
      'then copy the resulting video URL back into SMG Social Hub for reference.',
  }
}

/**
 * Validates that the stored access token has the upload scope by making a
 * lightweight tokeninfo call. Use this before presenting the upload option
 * in the UI so you can prompt re-auth early.
 */
export async function validateYouTubeUploadScope(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    )

    if (!response.ok) return false

    const data = (await response.json()) as { scope?: string }
    const scopes = data.scope?.split(' ') ?? []
    return scopes.includes('https://www.googleapis.com/auth/youtube.upload')
  } catch {
    return false
  }
}
