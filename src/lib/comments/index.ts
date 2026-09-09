import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import type { Platform } from '@/types'
import type { CommentFetchResult } from './types'
import { fetchFacebookPageComments } from './facebook'
import { fetchInstagramComments } from './instagram'
import { fetchLinkedInComments } from './linkedin'
import { fetchYouTubeComments } from './youtube'
import { fetchTikTokComments } from './tiktok'
import { searchRedditComments } from './reddit'
import { searchTwitter } from './twitter'
import { extractPostIdentifier } from './parse'

interface AdditionalUrl {
  platform: string
  url: string
  relevanceNote?: string
}

interface ScanParams {
  brandId: string
  platforms?: string[]
  additionalUrls?: AdditionalUrl[]
}

interface ScanResult {
  created: number
  platforms: string[]
}

interface NewOpportunityData {
  platform: string
  postUrl: string
  postTitle?: string | null
  postContent?: string | null
  commentId?: string | null
  commentText?: string | null
  authorName?: string | null
  authorHandle?: string | null
  isOwned: boolean
  relevanceNote?: string | null
  status: string
}

async function getDecryptedConnection(
  brandId: string,
  platform: Platform
): Promise<{ accessToken: string; accountId: string | null } | null> {
  const connection = await prisma.platformConnection.findUnique({
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

export function buildOpportunityDedupeKey(
  brandId: string,
  postUrl: string,
  commentId: string | null
): string {
  const itemKey = commentId === null ? 'post-level' : `comment:${commentId}`
  return createHash('sha256')
    .update(`${brandId}\u0000${postUrl}\u0000${itemKey}`)
    .digest('hex')
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}

async function createOpportunityIfNew(
  brandId: string,
  data: NewOpportunityData
): Promise<boolean> {
  const commentId = data.commentId ?? null
  const dedupeKey = buildOpportunityDedupeKey(brandId, data.postUrl, commentId)

  try {
    await prisma.commentOpportunity.create({
      data: {
        dedupeKey,
        brandId,
        platform: data.platform,
        postUrl: data.postUrl,
        postTitle: data.postTitle ?? null,
        postContent: data.postContent ?? null,
        commentId,
        commentText: data.commentText ?? null,
        authorName: data.authorName ?? null,
        authorHandle: data.authorHandle ?? null,
        isOwned: data.isOwned,
        relevanceNote: data.relevanceNote ?? null,
        status: data.status,
      },
    })
    return true
  } catch (error) {
    // The unique dedupeKey is the concurrency boundary. If another overlapping
    // scan inserted the same opportunity first, that is a successful no-op.
    if (isUniqueConstraintError(error)) return false
    throw error
  }
}

async function upsertOpportunities(
  brandId: string,
  results: CommentFetchResult[],
  isOwned: boolean,
  relevanceNote?: string
): Promise<number> {
  let created = 0

  for (const result of results) {
    if (result.comments.length === 0) {
      // Post-level opportunity with no individual comments.
      if (
        await createOpportunityIfNew(brandId, {
          platform: result.platform,
          postUrl: result.postUrl,
          postTitle: result.postTitle ?? null,
          postContent: result.postContent ?? null,
          commentId: null,
          isOwned,
          relevanceNote: relevanceNote ?? null,
          status: 'PENDING',
        })
      ) {
        created++
      }
      continue
    }

    for (const comment of result.comments) {
      if (
        await createOpportunityIfNew(brandId, {
          platform: result.platform,
          postUrl: result.postUrl,
          postTitle: result.postTitle ?? null,
          postContent: result.postContent ?? null,
          commentId: comment.commentId,
          commentText: comment.text,
          authorName: comment.authorName,
          authorHandle: comment.authorHandle ?? null,
          isOwned,
          relevanceNote: relevanceNote ?? null,
          status: 'PENDING',
        })
      ) {
        created++
      }
    }
  }

  return created
}

async function scanFacebook(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  const conn = await getDecryptedConnection(brandId, 'FACEBOOK')
  if (!conn || !conn.accountId) return { results: [], isOwned: true }

  const results = await fetchFacebookPageComments({
    pageId: conn.accountId,
    accessToken: conn.accessToken,
    limit: 10,
  })

  return { results, isOwned: true }
}

async function scanInstagram(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  const conn = await getDecryptedConnection(brandId, 'INSTAGRAM')
  if (!conn || !conn.accountId) return { results: [], isOwned: true }

  const results = await fetchInstagramComments({
    igUserId: conn.accountId,
    accessToken: conn.accessToken,
    limit: 10,
  })

  return { results, isOwned: true }
}

async function scanLinkedIn(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  const conn = await getDecryptedConnection(brandId, 'LINKEDIN')
  if (!conn) return { results: [], isOwned: true }

  // LinkedIn requires a postUrn to fetch comments on a specific post.
  // Without one, return empty — the user should provide specific URNs via additionalUrls.
  return { results: [], isOwned: true }
}

async function scanYouTube(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  const conn = await getDecryptedConnection(brandId, 'YOUTUBE')
  if (!conn) return { results: [], isOwned: true }

  const result = await fetchYouTubeComments({
    accessToken: conn.accessToken,
    channelId: conn.accountId ?? undefined,
    limit: 50,
  })

  return { results: [result], isOwned: true }
}

async function scanReddit(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  const arcadeApiKey = process.env.ARCADE_API_KEY
  const arcadeUserId = process.env.ARCADE_USER_ID

  if (!arcadeApiKey || !arcadeUserId) return { results: [], isOwned: false }

  // Load brand keywords from brand context
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return { results: [], isOwned: false }

  let keywords: string[] = []
  try {
    const ctx = JSON.parse(brand.context) as Record<string, unknown>
    const msgs = Array.isArray(ctx.keyMessages) ? ctx.keyMessages as string[] : []
    const products = Array.isArray(ctx.products) ? ctx.products as string[] : []
    keywords = [...msgs.slice(0, 3), ...products.slice(0, 3), brand.name]
  } catch {
    keywords = [brand.name]
  }

  const results = await searchRedditComments({
    keywords,
    arcadeApiKey,
    userId: arcadeUserId,
    limit: 25,
  })

  return { results, isOwned: false }
}

async function scanTwitter(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  const arcadeApiKey = process.env.ARCADE_API_KEY
  const arcadeUserId = process.env.ARCADE_USER_ID

  if (!arcadeApiKey || !arcadeUserId) return { results: [], isOwned: false }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return { results: [], isOwned: false }

  let keywords: string[] = []
  try {
    const ctx = JSON.parse(brand.context) as Record<string, unknown>
    const msgs = Array.isArray(ctx.keyMessages) ? ctx.keyMessages as string[] : []
    keywords = [...msgs.slice(0, 2), brand.name]
  } catch {
    keywords = [brand.name]
  }

  const results = await searchTwitter({
    keywords,
    arcadeApiKey,
    userId: arcadeUserId,
    limit: 25,
  })

  return { results, isOwned: false }
}

async function scanTikTok(brandId: string): Promise<{ results: CommentFetchResult[]; isOwned: boolean }> {
  // TikTok requires an explicit videoId — not supportable as a generic scan.
  // Users should provide video URLs via additionalUrls.
  return { results: [], isOwned: true }
}

// Platforms whose comments can be fetched from a single user-supplied post
// identifier (URN / video id) rather than a generic account-wide scan.
const ID_DRIVEN_PLATFORMS = new Set(['LINKEDIN', 'TIKTOK'])

/**
 * Fetch the comments on one specific LinkedIn or TikTok post identified by a
 * user-supplied URN / video id. Returns null when the platform isn't id-driven,
 * the id can't be parsed, or there's no active connection — the caller then
 * falls back to creating a bare post-level opportunity.
 */
async function fetchSpecificPost(
  brandId: string,
  platform: string,
  urlOrId: string
): Promise<CommentFetchResult | null> {
  if (!ID_DRIVEN_PLATFORMS.has(platform)) return null

  const identifier = extractPostIdentifier(platform, urlOrId)
  if (!identifier) return null

  const conn = await getDecryptedConnection(brandId, platform as Platform)
  if (!conn) return null

  if (platform === 'LINKEDIN') {
    return fetchLinkedInComments({ accessToken: conn.accessToken, postUrn: identifier })
  }

  if (platform === 'TIKTOK') {
    return fetchTikTokComments({ accessToken: conn.accessToken, videoId: identifier })
  }

  return null
}

const PLATFORM_SCANNERS: Record<
  string,
  (brandId: string) => Promise<{ results: CommentFetchResult[]; isOwned: boolean }>
> = {
  FACEBOOK: scanFacebook,
  INSTAGRAM: scanInstagram,
  LINKEDIN: scanLinkedIn,
  YOUTUBE: scanYouTube,
  REDDIT: scanReddit,
  TWITTER: scanTwitter,
  TIKTOK: scanTikTok,
}

export async function scanCommentsForBrand(params: ScanParams): Promise<ScanResult> {
  const { brandId, platforms, additionalUrls = [] } = params

  const targetPlatforms =
    platforms && platforms.length > 0
      ? platforms.map((p) => p.toUpperCase())
      : Object.keys(PLATFORM_SCANNERS)

  let totalCreated = 0
  const activePlatforms: string[] = []

  // Scan each connected platform
  const scanPromises = targetPlatforms.map(async (platform) => {
    const scanner = PLATFORM_SCANNERS[platform]
    if (!scanner) return

    const { results, isOwned } = await scanner(brandId)
    const created = await upsertOpportunities(brandId, results, isOwned)

    if (created > 0 || results.length > 0) {
      activePlatforms.push(platform)
      totalCreated += created
    }
  })

  await Promise.all(scanPromises)

  // Process manually provided additional URLs
  for (const extra of additionalUrls) {
    const platform = extra.platform.toUpperCase()

    // For id-driven platforms (LinkedIn / TikTok) pull the actual comments on
    // the specified post instead of just recording a bare post-level entry.
    const fetched = await fetchSpecificPost(brandId, platform, extra.url)
    if (fetched) {
      const created = await upsertOpportunities(brandId, [fetched], false, extra.relevanceNote)
      if (created > 0) {
        totalCreated += created
        if (!activePlatforms.includes(platform)) activePlatforms.push(platform)
      }
      continue
    }

    // Fallback: record the URL as a post-level opportunity to monitor manually.
    if (
      await createOpportunityIfNew(brandId, {
        platform,
        postUrl: extra.url,
        commentId: null,
        isOwned: false,
        relevanceNote: extra.relevanceNote ?? null,
        status: 'PENDING',
      })
    ) {
      totalCreated++
      if (!activePlatforms.includes(platform)) {
        activePlatforms.push(platform)
      }
    }
  }

  return { created: totalCreated, platforms: activePlatforms }
}
