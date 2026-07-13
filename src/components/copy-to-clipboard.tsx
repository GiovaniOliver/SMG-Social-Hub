'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyToClipboardProps {
  text: string
  label?: string
  className?: string
}

export function CopyToClipboard({ text, label = 'Copy to Clipboard', className }: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={className ?? 'btn-secondary flex items-center gap-2'}
      type="button"
    >
      {copied ? (
        <>
          <Check size={15} className="text-green-400" />
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy size={15} />
          <span>{label}</span>
        </>
      )}
    </button>
  )
}
