export interface PublishParams {
  content: string
  mediaUrls?: string[]      // public URLs only
  title?: string            // Reddit/YouTube only
  subreddit?: string        // Reddit only
  accessToken: string       // platform access token (decrypted)
  accountId?: string        // page ID (Facebook), business account ID (Instagram), etc.
}

export interface PublishResult {
  success: boolean
  postId?: string
  postUrl?: string
  error?: string
  requiresAuth?: boolean
  authUrl?: string
}
