import Link from 'next/link'
import { Bot, UsersRound, Settings2 } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          System configuration is organized by integration area.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/ai-integrations" className="card hover:border-blue-600 transition-colors">
          <Bot size={20} className="text-blue-300" />
          <h2 className="text-sm font-semibold text-white mt-3">AI Integrations</h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage Gemini, Claude, OpenAI, Ollama, Runware, model defaults, and API credentials.
          </p>
        </Link>

        <Link href="/accounts" className="card hover:border-blue-600 transition-colors">
          <UsersRound size={20} className="text-blue-300" />
          <h2 className="text-sm font-semibold text-white mt-3">Social Accounts</h2>
          <p className="text-xs text-slate-400 mt-1">
            Connect and inventory Facebook, Instagram, X, LinkedIn, TikTok, YouTube, and Reddit identities.
          </p>
        </Link>
      </div>

      <div className="card flex gap-3">
        <Settings2 size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-white">More settings coming here</p>
          <p className="text-xs text-slate-400 mt-1">
            General publishing, notification, scheduling, and workspace settings can be added without mixing them with provider credentials.
          </p>
        </div>
      </div>
    </div>
  )
}
