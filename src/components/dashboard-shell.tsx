'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Layers, Menu, X } from 'lucide-react'
import { SidebarNav } from '@/components/sidebar-nav'
import { BrandSelector } from '@/components/brand-selector'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-slate-700 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
            <Layers size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">SMG Social Hub</p>
            <p className="text-xs text-slate-400 leading-tight">Multi-brand</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <BrandSelector />

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
      </div>

      <div className="px-4 py-3 border-t border-slate-700">
        <p className="text-xs text-slate-500">SMG Business</p>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-900 lg:flex lg:h-screen lg:overflow-hidden">
      <aside className="hidden lg:flex w-56 flex-shrink-0 bg-slate-800 border-r border-slate-700 flex-col">
        {sidebarContent}
      </aside>

      <div
        className="lg:hidden sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-slate-700 bg-slate-900/95 px-3 backdrop-blur"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          minHeight: 'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Menu size={21} />
        </button>

        <div className="flex items-center gap-2 min-w-0 px-2">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
            <Layers size={14} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-white truncate">SMG Social Hub</p>
        </div>

        <div className="w-10" aria-hidden="true" />
      </div>

      <div
        className={[
          'lg:hidden fixed inset-0 z-40 transition-opacity duration-200',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          tabIndex={mobileOpen ? 0 : -1}
        />

        <aside
          className={[
            'absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-3rem))] max-w-full flex-col border-r border-slate-700 bg-slate-800 shadow-2xl transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          {sidebarContent}
        </aside>
      </div>

      <main className="dashboard-main min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-900">
        {children}
      </main>
    </div>
  )
}
