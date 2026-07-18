'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Sparkles,
  Rocket,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  MessageSquare,
  Link2,
  Building2,
  Settings,
  LogOut,
} from 'lucide-react'
import clsx from 'clsx'

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/create', label: 'Content Lab', icon: Sparkles },
  { href: '/campaigns', label: 'Campaigns', icon: Rocket },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/schedule', label: 'Schedule', icon: CalendarPlus },
  { href: '/queue', label: 'Queue', icon: ClipboardList },
  { href: '/comments', label: 'Comments', icon: MessageSquare },
  { href: '/brands', label: 'Brands', icon: Building2 },
  { href: '/connect', label: 'Connect', icon: Link2 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
            {item.label}
          </Link>
        )
      })}

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
      >
        <LogOut size={18} strokeWidth={1.75} />
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </nav>
  )
}
