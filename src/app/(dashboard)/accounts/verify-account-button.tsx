'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react'

interface VerificationData {
  success: boolean
  status: 'CONNECTED' | 'NEEDS_REAUTH' | 'DISCONNECTED' | 'ERROR'
  message: string
}

export function VerifyAccountButton({ accountId }: { accountId: string }) {
  const router = useRouter()
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<VerificationData | null>(null)

  async function verify() {
    setVerifying(true)
    setResult(null)

    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/verify`, {
        method: 'POST',
      })
      const json = (await response.json()) as {
        success: boolean
        data?: VerificationData
        error?: string
      }

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Unable to verify this account')
      }

      setResult(json.data)
      router.refresh()
    } catch (error) {
      setResult({
        success: false,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Unable to verify this account',
      })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={verify}
        disabled={verifying}
        className="btn-secondary min-h-10 w-full sm:w-auto inline-flex items-center justify-center gap-2 text-xs disabled:opacity-50"
      >
        <RefreshCw size={13} className={verifying ? 'animate-spin' : ''} />
        {verifying ? 'Verifying…' : 'Verify connection'}
      </button>

      {result && (
        <p
          className={`flex items-start gap-1.5 text-[11px] ${
            result.success ? 'text-green-300' : 'text-amber-300'
          }`}
          role="status"
        >
          {result.success ? (
            <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
          ) : (
            <TriangleAlert size={13} className="mt-0.5 flex-shrink-0" />
          )}
          <span>{result.message}</span>
        </p>
      )}
    </div>
  )
}
