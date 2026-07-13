export type Platform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TWITTER'
  | 'LINKEDIN'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'REDDIT'

export const PLATFORMS: Platform[] = [
  'FACEBOOK',
  'INSTAGRAM',
  'TWITTER',
  'LINKEDIN',
  'TIKTOK',
  'YOUTUBE',
  'REDDIT',
]

export const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TWITTER: 'Twitter / X',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  REDDIT: 'Reddit',
}

export type PostStatus = 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED'

export type CommentStatus = 'PENDING' | 'DRAFT_READY' | 'APPROVED' | 'POSTED' | 'SKIPPED'

export interface BrandVoice {
  tone: string
  personality: string
  avoid: string[]
  cta?: string
}

export interface BrandContext {
  products: string[]
  faqs: Array<{ q: string; a: string }>
  targetAudience: string[]
  keyMessages: string[]
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

export interface PlatformConnectionRow {
  id: string
  brandId: string
  platform: Platform
  accountId: string | null
  accountLabel: string | null
  expiresAt: Date | null
  scopes: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ScheduledPostRow {
  id: string
  brandId: string
  platforms: string
  content: string
  mediaUrls: string
  scheduledAt: Date
  status: PostStatus
  publishedAt: Date | null
  error: string | null
  results: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CommentOpportunityRow {
  id: string
  brandId: string
  platform: Platform
  postUrl: string
  postTitle: string | null
  postContent: string | null
  commentId: string | null
  commentText: string | null
  authorName: string | null
  authorHandle: string | null
  isOwned: boolean
  relevanceNote: string | null
  status: CommentStatus
  approvedReply: string | null
  postedAt: Date | null
  discoveredAt: Date
  updatedAt: Date
}
