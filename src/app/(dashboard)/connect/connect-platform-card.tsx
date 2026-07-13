'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react'
import type { Platform } from '@/types'

const PLATFORM_COLORS: Record<Platform, string> = {
  FACEBOOK: 'bg-blue-600',
  INSTAGRAM: 'bg-gradient-to-br from-purple-600 to-pink-500',
  TWITTER: 'bg-slate-900 border border-slate-600',
  LINKEDIN: 'bg-blue-700',
  TIKTOK: 'bg-black border border-slate-600',
  YOUTUBE: 'bg-red-600',
  REDDIT: 'bg-orange-600',
}

const PLATFORM_ICONS: Record<Platform, string> = {
  FACEBOOK: 'f',
  INSTAGRAM: '📷',
  TWITTER: '𝕏',
  LINKEDIN: 'in',
  TIKTOK: '♪',
  YOUTUBE: '▶',
  REDDIT: 'r/',
}

const OAUTH_ROUTES: Record<Platform, string | null> = {
  FACEBOOK: '/api/oauth/facebook',
  INSTAGRAM: '/api/oauth/facebook', // Instagram via Facebook
  TWITTER: null, // Arcade-based, handled differently
  LINKEDIN: '/api/oauth/linkedin',
  TIKTOK: '/api/oauth/tiktok',
  YOUTUBE: '/api/oauth/google',
  REDDIT: null, // Arcade-based
}

interface ConnectionInfo {
  id: string
  accountLabel: string | null
  expiresAt: string | null
}

interface Props {
  platform: Platform
  label: string
  brandId: string
  connection: ConnectionInfo | null
}

export function ConnectPlatformCard({ platform, label, brandId, connection }: Props) {
  const [disconnecting, setDisconnecting] = useState(false)

  const isConnected = connection !== null
  const oauthRoute = OAUTH_ROUTES[platform]
  const isArcadePlatform = oauthRoute === null

  async function handleDisconnect() {
    if (!connection) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/connections?id=${connection.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to disconnect')
      window.location.reload()
    } catch {
      setDisconnecting(false)
    }
  }

  function handleConnect() {
    if (!oauthRoute) return
    window.location.href = `${oauthRoute}?brandId=${brandId}`
  }

  const colorClass = PLATFORM_COLORS[platform]
  const iconText = PLATFORM_ICONS[platform]

  return (
    <div className="card flex flex-col gap-4">
      {/* Platform header */}
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${colorClass}`}
        >
          {iconText}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{label}</p>
          {isConnected && connection.accountLabel && (
            <p className="text-xs text-slate-400 truncate">{connection.accountLabel}</p>
          )}
        </div>
        {isConnected ? (
          <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
        ) : (
          <XCircle size={16} className="text-slate-600 flex-shrink-0" />
        )}
      </div>

      {/* Status */}
      <div className="text-xs text-slate-400">
        {isConnected ? (
          <span className="text-green-400 font-medium">Connected</span>
        ) : isArcadePlatform ? (
          <span className="text-slate-500">Managed via Arcade.dev</span>
        ) : (
          <span className="text-slate-500">Not connected</span>
        )}
        {isConnected && connection.expiresAt && (
          <span className="ml-1 text-slate-500">
            &middot; expires {new Date(connection.expiresAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {isConnected ? (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="btn-danger flex items-center gap-1.5 flex-1 justify-center"
          >
            {disconnecting && <Loader2 size={13} className="animate-spin" />}
            Disconnect
          </button>
        ) : isArcadePlatform ? (
          <a
            href="https://arcade.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-1.5 flex-1 justify-center text-sm"
          >
            <ExternalLink size={13} />
            Configure
          </a>
        ) : (
          <button
            onClick={handleConnect}
            className="btn-primary flex-1"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  )
}
