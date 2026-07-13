import { Layers } from 'lucide-react'
import { SidebarNav } from '@/components/sidebar-nav'
import { BrandSelector } from '@/components/brand-selector'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode 
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-800 border-r border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-700 mb-3">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
            <Layers size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">SMG Social Hub</p>
            <p className="text-xs text-slate-400 leading-tight">Multi-brand</p>
          </div>
        </div>

        {/* Brand Selector */}
        <BrandSelector />

        {/* Nav */}
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">SMG Business</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-900">
        {children}
      </main>
    </div>
  )
}
