export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { db } from '@/lib/db'
import { format } from 'date-fns'
import { ClipboardList, AlertCircle, ExternalLink } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { PlatformIconList } from '@/components/platform-icons'
import { QueueActions } from './queue-actions'
import type { Platform, PostStatus } from '@/types'

type StatusFilter = PostStatus | 'ALL'

const FILTER_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>
}

async function getPosts(status: StatusFilter, page: number) {
  const pageSize = 25
  const where =
    status === 'ALL'
      ? {}
      : { status }

  const [total, posts] = await Promise.all([
    db.scheduledPost.count({ where }),
    db.scheduledPost.findMany({
      where,
      include: { brand: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { posts, total, pageSize }
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function getPostUrl(results: string): string | null {
  const parsed = parseJsonSafe<Record<string, { postUrl?: string }>>(results, {})
  for (const platform of Object.values(parsed)) {
    if (platform.postUrl) return platform.postUrl
  }
  return null
}

export default async function QueuePage({ searchParams }: PageProps) {
  const { status: rawStatusParam, page: rawPage } = await searchParams
  const rawStatus = rawStatusParam?.toUpperCase() as StatusFilter | undefined
  const activeFilter: StatusFilter =
    rawStatus && FILTER_TABS.some((t) => t.value === rawStatus) ? rawStatus : 'ALL'

  const page = Math.max(1, parseInt(rawPage ?? '1', 10))

  const { posts, total, pageSize } = await getPosts(activeFilter, page)
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Post Queue</h1>
          <p className="text-slate-400 text-sm mt-1">
            All scheduled and published posts across your brands.
          </p>
        </div>
        <Link
          href="/schedule"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          + Schedule Post
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-700">
        {FILTER_TABS.map((tab) => {
          const isActive = tab.value === activeFilter
          const href =
            tab.value === 'ALL' ? '/queue' : `/queue?status=${tab.value.toLowerCase()}`
          return (
            <Link
              key={tab.value}
              href={href}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'text-white border-blue-500 bg-slate-800'
                  : 'text-slate-400 border-transparent hover:text-white hover:border-slate-600'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {posts.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList size={40} className="text-slate-600 mb-4" />
          <h2 className="text-white font-medium mb-1">No posts found</h2>
          <p className="text-slate-400 text-sm">
            {activeFilter === 'ALL'
              ? 'Schedule your first post from the Schedule page.'
              : `No ${activeFilter.toLowerCase()} posts.`}
          </p>
          {activeFilter === 'ALL' && (
            <Link
              href="/schedule"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Schedule a Post
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Brand</th>
                  <th className="text-left px-4 py-3 font-medium">Content</th>
                  <th className="text-left px-4 py-3 font-medium">Platforms</th>
                  <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                    Scheduled For
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => {
                  const platforms = parseJsonSafe<Platform[]>(post.platforms, [])
                  const postUrl = getPostUrl(post.results)
                  const status = post.status as PostStatus

                  return (
                    <tr
                      key={post.id}
                      className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/20 transition-colors"
                    >
                      {/* Brand */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-slate-200 font-medium text-xs">
                          {post.brand.name}
                        </span>
                      </td>

                      {/* Content */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-white text-xs truncate max-w-[240px]" title={post.content}>
                          {post.content.length > 60
                            ? post.content.slice(0, 60) + '\u2026'
                            : post.content}
                        </p>
                        {post.error && (
                          <div className="flex items-start gap-1 mt-1">
                            <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                            <p
                              className="text-red-400 text-xs truncate max-w-[220px]"
                              title={post.error}
                            >
                              {post.error}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Platforms */}
                      <td className="px-4 py-3">
                        <PlatformIconList platforms={platforms} size={24} />
                      </td>

                      {/* Scheduled For */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                        <span>{format(new Date(post.scheduledAt), 'MMM d, yyyy')}</span>
                        <span className="block text-slate-500">
                          {format(new Date(post.scheduledAt), 'h:mm a')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {status === 'PUBLISHED' && postUrl && (
                            <a
                              href={postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              <ExternalLink size={12} />
                              View
                            </a>
                          )}
                          <QueueActions postId={post.id} status={status} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-700 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                {total} post{total !== 1 ? 's' : ''} total
              </span>
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/queue?${activeFilter !== 'ALL' ? `status=${activeFilter.toLowerCase()}&` : ''}page=${page - 1}`}
                    className="px-3 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-300 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span>
                  Page {page} of {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={`/queue?${activeFilter !== 'ALL' ? `status=${activeFilter.toLowerCase()}&` : ''}page=${page + 1}`}
                    className="px-3 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-300 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
