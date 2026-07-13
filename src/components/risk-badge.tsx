'use client'

import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

interface RiskBadgeProps {
  level: RiskLevel
  flags?: string[]
  showFlags?: boolean
}

const RISK_CONFIG: Record<RiskLevel, { label: string; icon: typeof ShieldCheck; classes: string; dotClass: string }> = {
  LOW: {
    label: 'Low Risk',
    icon: ShieldCheck,
    classes: 'bg-green-900 text-green-300 border-green-700',
    dotClass: 'bg-green-400',
  },
  MEDIUM: {
    label: 'Medium Risk',
    icon: ShieldAlert,
    classes: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    dotClass: 'bg-yellow-400',
  },
  HIGH: {
    label: 'High Risk',
    icon: ShieldX,
    classes: 'bg-red-900 text-red-300 border-red-700',
    dotClass: 'bg-red-400',
  },
}

export function RiskBadge({ level, flags, showFlags = false }: RiskBadgeProps) {
  const config = RISK_CONFIG[level]
  const Icon = config.icon

  return (
    <div className="space-y-2">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm font-medium ${config.classes}`}
      >
        <Icon size={14} />
        {config.label}
      </span>

      {showFlags && flags && flags.length > 0 && (
        <ul className="space-y-1">
          {flags.map((flag, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-slate-400"
            >
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotClass}`} />
              {flag}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
