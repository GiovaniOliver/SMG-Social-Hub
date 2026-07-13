export interface CommentFetchResult {
  platform: string
  postUrl: string
  postTitle?: string
  postContent?: string
  comments: Array<{
    commentId: string
    text: string
    authorName: string
    authorHandle?: string
    createdAt?: string
  }>
}

export interface FetchCommentsParams {
  accessToken: string
  accountId?: string        // page ID, channel ID, etc.
  postUrl?: string          // for targeted fetch
  searchKeywords?: string[] // for keyword-based search
  limit?: number
}
