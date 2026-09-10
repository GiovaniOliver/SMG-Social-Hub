import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/db'
import type { PublishResult } from './types'
import { publishToFacebook } from './facebook'
import { publishToInstagram } from './instagram'
import { publishToTwitter } from './twitter'
import { publishToReddit } from './reddit'
import { publishToLinkedIn } from './linkedin'
import { publishToTikTok } from './tiktok'
import { publishToYouTube } from './youtube'

const ARCADE_API_KEY = process.env.ARCADE_API_KEY ?? ''

type SupportedPlatform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TWITTER'
  | 'LINKEDIN'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'REDDIT'

const SUPPORTED_PLATFORMS: SupportedPlatform[] = [
  'FACEBOOK',
  'INSTAGRAM',
  'TWITTER',
  'LINKEDIN',
  'TIKTOK',
  'YOUTUBE',
  'REDDIT',
]

const SUPPORTED_PLATFORM_SET = new Set<string>(SUPPORTED_PLATFORMS)

function isSupportedPlatform(value: string): value is SupportedPlatform {
  return SUPPORTED_PLATFORM_SET.has(value)
}

export interface PublishPostParams {
  brandId: string
  platforms: string[]
  content: string
  mediaUrls?: string[]
  title?: string
  subreddit?: string
  userId?: string
}

export async function getConnectionForBrand(brandId: string, platform: string) {
  return prisma.platformConnection.findUnique({
    where: {
      brandId_platform: {
        brandId,
        platform: platform.toUpperCase(),
      },
    },
  })
}

async function dispatchToPlatform(
  platform: SupportedPlatform,
  params: {
    content: string
    mediaUrls?: string[]
    title?: string
    subreddit?: string
    accessToken: string
    accountId?: string | null
    userId?: string
  },
): Promise<PublishResult> {
  const baseParams = {
    content: params.content,
    mediaUrls: params.mediaUrls,
    title: params.title,
    subreddit: params.subreddit,
    accessToken: params.accessToken,
    accountId: params.accountId ?? undefined,
  }

  switch (platform) {
    case 'FACEBOOK':
      return publishToFacebook(baseParams)

    case 'INSTAGRAM':
      return publishToInstagram(baseParams)

    case 'TWITTER':
      if (!ARCADE_API_KEY) {
        return {
          success: false,
          error: 'ARCADE_API_KEY environment variable is not configured.',
        }
      }
      if (!params.userId) {
        return {
          success: false,
          error: 'No Arcade identity is associated with this X connection.',
        }
      }
      return publishToTwitter({
        ...baseParams,
        arcadeApiKey: ARCADE_API_KEY,
        userId: params.userId,
      })

    case 'REDDIT':
      if (!ARCADE_API_KEY) {
        return {
          success: false,
          error: 'ARCADE_API_KEY environment variable is not configured.',
        }
      }
      if (!params.userId) {
        return {
          success: false,
          error: 'No Arcade identity is associated with this Reddit connection.',
        }
      }
      return publishToReddit({
        ...baseParams,
        arcadeApiKey: ARCADE_API_KEY,
        userId: params.userId,
      })

    case 'LINKEDIN':
      return publishToLinkedIn(baseParams)

    case 'TIKTOK':
      return publishToTikTok(baseParams)

    case 'YOUTUBE':
      return publishToYouTube(baseParams)

    default: {
      const exhaustiveCheck: never = platform
      return {
        success: false,
        error: `Unknown platform: ${String(exhaustiveCheck)}`,
      }
    }
  }
}

export async function publishPost(
  params: PublishPostParams,
): Promise<Record<string, PublishResult>> {
  const results: Record<string, PublishResult> = {}

  await Promise.all(
    params.platforms.map(async (rawPlatform) => {
      const platform = rawPlatform.toUpperCase()

      if (!isSupportedPlatform(platform)) {
        results[platform] = {
          success: false,
          error: `Platform "${platform}" is not supported. Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}.`,
        }
        return
      }

      const connection = await getConnectionForBrand(params.brandId, platform)

      if (!connection) {
        results[platform] = {
          success: false,
          error: `No ${platform} connection found for brand ${params.brandId}. Connect and assign the account first in Social Hub.`,
        }
        return
      }

      if (!connection.isActive) {
        results[platform] = {
          success: false,
          error: `${platform} connection for brand ${params.brandId} is inactive. Re-authorize the account.`,
        }
        return
      }

      if (connection.expiresAt && connection.expiresAt <= new Date()) {
        results[platform] = {
          success: false,
          error: `${platform} access token expired at ${connection.expiresAt.toISOString()}. Re-authorize the account.`,
        }
        return
      }

      let accessToken: string
      try {
        accessToken = decrypt(connection.accessToken)
      } catch (decryptError) {
        results[platform] = {
          success: false,
          error: `Failed to decrypt ${platform} access token: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
        }
        return
      }

      const arcadeUserId =
        platform === 'TWITTER' || platform === 'REDDIT'
          ? connection.accountId || params.userId
          : params.userId

      const result = await dispatchToPlatform(platform, {
        content: params.content,
        mediaUrls: params.mediaUrls,
        title: params.title,
        subreddit: params.subreddit,
        accessToken,
        accountId: connection.accountId,
        userId: arcadeUserId || undefined,
      })

      results[platform] = result
    }),
  )

  return results
}
