export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ExternalLink, Link2, ShieldCheck, ShieldAlert, CircleOff } from 'lucide-react'
import { listSocialAccounts, type SocialAccountRow } from '@/lib/social-accounts'
import { PLATFORM_LABELS } from '@/types'
import { ManualAccountForm } from './manual-account-form'

const CONNECTORS = [
  {
    name: 'Meta',
    description: 'Import Facebook Pages and linked Instagram professional accounts.',
    href: '/api/oauth/facebook',
    platforms: 'Facebook + Instagram',
  },
  {
    name: 'YouTube',
    description: 'Connect the YouTube channel owned by a Google account.',
    href: '/api/oauth/google',
    platforms: 'YouTube',
  },
  {
    name: 'LinkedIn',
    description: 'Connect a LinkedIn member publishing identity.',
    href: '/api/oauth/linkedin',
    platforms: 'LinkedIn',
  },
  {
    name: 'TikTok',
    description: 'Connect a TikTok account for publishing workflows.',
    href: '/api/oauth/tiktok',
    platforms: 'TikTok',
  },
]

function statusClasses(status: SocialAccountRow['connectionStatus']) {
  if (status === 'CONNECTED') return 'text-green-300 bg-green-950/50 border-green-800'
  if (status === 'NEEDS_REAUTH') return 'text-amber-300 bg-amber-950/50 border-amber-800'
  if (status === 'ERROR') return 'text-red-300 bg-red-950/50 border-red-800'
  return 'text-slate-300 bg-slate-800 border-slate-700'
}

function capabilityLabel(account: SocialAccountRow) {
  if (account.publishingCapability === 'AUTOMATIC') return 'Auto publish'
  if (account.publishingCapability === 'READ_ONLY') return 'Read only'
  if (account.publishingCapability === 'UNSUPPORTED') return 'No API publishing'
  return 'Manual publish'
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const { success, error } = await searchParams
  let accounts: SocialAccountRow[] = []
  let loadError: string | null = null

  try {
    accounts = await listSocialAccounts()
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unable to load accounts'
  }

  const connected = accounts.filter((account) => account.connectionStatus === 'CONNECTED').length
  const automatic = accounts.filter((account) => account.publishingCapability === 'AUTOMATIC').length
  const manual = accounts.filter((account) => account.publishingCapability === 'MANUAL' || account.publishingCapability === 'UNSUPPORTED').length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Social Accounts</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Connect and inventory the social profiles you already own. Brand and creator assignments come later.
          </p>
        </div>
        <ManualAccountForm />
      </div>

      {success && (
        <div className="px-4 py-3 rounded-md border border-green-800 bg-green-950/50 text-green-300 text-sm">
          {success}
        </div>
      )}
      {(error || loadError) && (
        <div className="px-4 py-3 rounded-md border border-red-800 bg-red-950/50 text-red-300 text-sm">
          {error || loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Accounts inventoried</p>
          <p className="text-2xl font-semibold text-white mt-2">{accounts.length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Connected</p>
          <p className="text-2xl font-semibold text-white mt-2">{connected}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Publishing</p>
          <p className="text-sm text-white mt-2">{automatic} automatic · {manual} manual/non-API</p>
        </div>
      </div>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-white">Connect provider</h2>
          <p className="text-xs text-slate-500 mt-1">A provider authorization can discover one or more publishing identities.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {CONNECTORS.map((connector) => (
            <div key={connector.name} className="card flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium text-white">{connector.name}</p>
                <p className="text-xs text-blue-300 mt-0.5">{connector.platforms}</p>
              </div>
              <p className="text-xs text-slate-400 flex-1">{connector.description}</p>
              <Link href={connector.href} className="btn-primary text-center flex items-center justify-center gap-2">
                <Link2 size={14} /> Connect
              </Link>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          X/Twitter and Reddit remain available for manual inventory while their Arcade-based connection path is audited.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Account inventory</h2>
            <p className="text-xs text-slate-500 mt-1">Every discovered or manually registered social identity appears here.</p>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="card text-center py-10">
            <CircleOff className="mx-auto text-slate-600" size={28} />
            <p className="text-sm text-slate-300 mt-3">No social accounts inventoried yet.</p>
            <p className="text-xs text-slate-500 mt-1">Start with Meta to import your Facebook Pages and linked Instagram accounts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accounts.map((account) => (
              <article key={account.id} className="card flex gap-4">
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-800 flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                    {account.platform.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{account.displayName}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {PLATFORM_LABELS[account.platform]} · {account.accountType.replaceAll('_', ' ').toLowerCase()}
                        {account.handle ? ` · ${account.handle}` : ''}
                      </p>
                    </div>
                    {account.profileUrl && (
                      <a href={account.profileUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className={`text-[11px] px-2 py-1 rounded border ${statusClasses(account.connectionStatus)}`}>
                      {account.connectionStatus === 'CONNECTED' ? <ShieldCheck size={11} className="inline mr-1" /> : <ShieldAlert size={11} className="inline mr-1" />}
                      {account.connectionStatus.replaceAll('_', ' ').toLowerCase()}
                    </span>
                    <span className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300">
                      {capabilityLabel(account)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
