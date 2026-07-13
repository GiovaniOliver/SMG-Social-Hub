'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Building2 } from 'lucide-react'
import clsx from 'clsx'

interface Brand {
  id: string
  name: string
  slug: string
}

export function BrandSelector() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selected, setSelected] = useState<Brand | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBrands() {
      try {
        const res = await fetch('/api/brands')
        if (!res.ok) throw new Error('Failed to load brands')
        const json = await res.json()
        const list: Brand[] = json.data ?? []
        setBrands(list)
        if (list.length > 0) setSelected(list[0])
      } catch {
        setBrands([])
      } finally {
        setLoading(false)
      }
    }

    fetchBrands()
  }, [])

  if (loading) {
    return (
      <div className="px-3 pb-4">
        <div className="h-9 bg-slate-700 rounded-md animate-pulse" />
      </div>
    )
  }

  if (brands.length === 0) {
    return (
      <div className="px-3 pb-4">
        <div className="flex items-center gap-2 px-3 py-2 text-slate-500 text-sm bg-slate-700 rounded-md">
          <Building2 size={16} />
          <span>No brands yet</span>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pb-4 relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm text-white transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={15} className="text-slate-400 flex-shrink-0" />
          <span className="truncate font-medium">{selected?.name ?? 'Select brand'}</span>
        </div>
        <ChevronDown
          size={14}
          className={clsx('text-slate-400 flex-shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 overflow-hidden">
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => {
                setSelected(brand)
                setOpen(false)
              }}
              className={clsx(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                selected?.id === brand.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-600 hover:text-white'
              )}
            >
              {brand.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
