'use client'

import { TagInput } from './form-controls'

export interface ContentEngineValues {
  niche: string
  audience: string
  engineTone: string
  goals: string[]
  website: string
  appStoreUrl: string
}

interface ContentEngineFieldsProps {
  values: ContentEngineValues
  onChange: (values: ContentEngineValues) => void
}

export function ContentEngineFields({ values, onChange }: ContentEngineFieldsProps) {
  function set<K extends keyof ContentEngineValues>(key: K, value: ContentEngineValues[K]) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Content Engine</h3>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Niche</label>
        <input
          value={values.niche}
          onChange={(e) => set('niche', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="e.g. home warranty tracking for property hosts"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Audience</label>
        <input
          value={values.audience}
          onChange={(e) => set('audience', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="e.g. Airbnb hosts managing multiple properties"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Engine Tone</label>
        <input
          value={values.engineTone}
          onChange={(e) => set('engineTone', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="e.g. helpful, no-nonsense"
        />
        <p className="text-xs text-slate-600 mt-1">
          Used by the Content Engine — separate from the Brand Voice tone above.
        </p>
      </div>

      <TagInput
        label="Goals"
        tags={values.goals}
        onChange={(tags) => set('goals', tags)}
        placeholder="Add a business goal..."
      />

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Website URL</label>
        <input
          type="url"
          value={values.website}
          onChange={(e) => set('website', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">App Store URL</label>
        <input
          type="url"
          value={values.appStoreUrl}
          onChange={(e) => set('appStoreUrl', e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="https://apps.apple.com/..."
        />
      </div>
    </div>
  )
}
