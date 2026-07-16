'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'

// ---------- Tag Input ----------

interface TagInputProps {
  label: string
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ label, tags, onChange, placeholder = 'Add item...' }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault()
      const newTag = inputValue.trim().replace(/,$/, '')
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag])
      }
      setInputValue('')
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="min-h-[38px] flex flex-wrap gap-1.5 bg-slate-900 border border-slate-600 rounded-md px-2.5 py-2 focus-within:border-blue-500 transition-colors">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-slate-200 text-xs rounded-md"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-slate-600 outline-none"
        />
      </div>
      <p className="text-xs text-slate-600 mt-1">Press Enter or comma to add</p>
    </div>
  )
}

// ---------- FAQ Editor ----------

interface FaqEditorProps {
  faqs: Array<{ q: string; a: string }>
  onChange: (faqs: Array<{ q: string; a: string }>) => void
}

export function FaqEditor({ faqs, onChange }: FaqEditorProps) {
  function updateFaq(index: number, field: 'q' | 'a', value: string) {
    const updated = faqs.map((faq, i) => (i === index ? { ...faq, [field]: value } : faq))
    onChange(updated)
  }

  function addFaq() {
    onChange([...faqs, { q: '', a: '' }])
  }

  function removeFaq(index: number) {
    onChange(faqs.filter((_, i) => i !== index))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-2">FAQs</label>
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <div key={i} className="bg-slate-900 border border-slate-700 rounded-md p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-xs text-slate-500 mt-1.5 flex-shrink-0 w-3">Q:</span>
              <textarea
                value={faq.q}
                onChange={(e) => updateFaq(i, 'q', e.target.value)}
                placeholder="Question..."
                rows={1}
                className="flex-1 bg-transparent border-b border-slate-700 text-sm text-white placeholder-slate-600 outline-none pb-1 resize-none"
              />
              <button
                type="button"
                onClick={() => removeFaq(i)}
                className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-slate-500 mt-1.5 flex-shrink-0 w-3">A:</span>
              <textarea
                value={faq.a}
                onChange={(e) => updateFaq(i, 'a', e.target.value)}
                placeholder="Answer..."
                rows={2}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none resize-none"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addFaq}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Plus size={13} />
          Add FAQ
        </button>
      </div>
    </div>
  )
}
