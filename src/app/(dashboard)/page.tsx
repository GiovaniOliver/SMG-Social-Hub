export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import { format } from 'date-fns'
import { PLATFORM_LABELS } from '@/types'
import type { Platform, PostStatus, CommentStatus } from '@/types'
import {
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  Link2,
} from 'lucide-react'

async function getDashboardData() {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(startOfToday.getTime() + 86400000)

  const [
    pendingPostsCount,
    publishedTodayCount,
    pendingCommentsCount,
    connectedPlatformsCount,
    recentPosts,
    recentComments,
  ] = await Promise.all([
    prisma.scheduledPost.count({ where: { status: 'PENDING' } }),
    prisma.scheduledPost.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: { gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.commentOpportunity.count({ where: { status: 'PENDING' } }),
    prisma.platformConnection.count({ where: { isActive: true } }),
    prisma.scheduledPost.findMany({
      take: 5,
      orderBy: { scheduledAt: 'desc' },
      include: { brand: { select: { name: true } } },
    }),
    prisma.commentOpportunity.findMany({
      take: 5,
      orderBy: { discoveredAt: 'desc' },
      include: { brand: { select: { name: true } } },
    }),
  ])

  return {
    stats: {
      pendingPostsCount,
      publishedTodayCount,
      pendingCommentsCount,
      connectedPlatformsCount,
    },
    recentPosts,
    recentComments,
  }
}

function StatusBadge({ status }: { status: PostStatus | CommentStatus }) {
  const map: Record<string, string> = {
    PENDING: 'badge-pending',
    PUBLISHING: 'badge-pending',
    PUBLISHED: 'badge-published',
    FAILED: 'badge-failed',
    CANCELLED: 'badge-skipped',
    DRAFT_READY: 'badge-draft',
    APPROVED: 'badge-draft',
    POSTED: 'badge-published',
    SKIPPED: 'badge-skipped',
  }
  return (
    <span className={map[status] ?? 'badge-skipped'}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default async function OverviewPage() {
  const { stats, recentPosts, recentComments } = await getDashboardData()

  const statCards = [
    {
      label: 'Pending Posts',
      value: stats.pendingPostsCount,
      icon: CalendarClock,
      color: 'text-yellow-400',
    },
    {
      label: 'Published Today',
      value: stats.publishedTodayCount,
      icon: CheckCircle2,
      color: 'text-green-400',
    },
    {
      label: 'Pending Comments',
      value: stats.pendingCommentsCount,
      icon: MessageCircle,
      color: 'text-blue-400',
    },
    {
      label: 'Connected Platforms',
      value: stats.connectedPlatformsCount,
      icon: Link2,
      color: 'text-purple-400',
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Overview</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                  {card.label}
                </p>
                <Icon size={16} className={card.color} />
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scheduled Posts */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">
            Recent Scheduled Posts
          </h2>
          {recentPosts.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              No scheduled posts yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => {
                const platforms: Platform[] = JSON.parse(post.platforms)
                return (
                  <div
                    key={post.id}
                    className="flex items-start justify-between gap-3 py-2 border-b border-slate-700 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{post.content}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {post.brand.name} &middot;{' '}
                        {platforms.map((p) => PLATFORM_LABELS[p]).join(', ')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {format(new Date(post.scheduledAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <StatusBadge status={post.status as PostStatus} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Comment Opportunities */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">
            Recent Comment Opportunities
          </h2>
          {recentComments.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              No comment opportunities yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentComments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start justify-between gap-3 py-2 border-b border-slate-700 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      {comment.commentText ?? comment.postTitle ?? 'Untitled'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {comment.brand.name} &middot;{' '}
                      {PLATFORM_LABELS[comment.platform as Platform]}
                    </p>
                    {comment.authorHandle && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        @{comment.authorHandle}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={comment.status as CommentStatus} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
