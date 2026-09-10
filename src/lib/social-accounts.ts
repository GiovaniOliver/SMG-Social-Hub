import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/crypto'
import type { Platform } from '@/types'

export type PublishingCapability = 'AUTOMATIC' | 'MANUAL' | 'READ_ONLY' | 'UNSUPPORTED'
export type ConnectionStatus = 'CONNECTED' | 'NEEDS_REAUTH' | 'DISCONNECTED' | 'ERROR'

export interface SocialAccountRow {
  id: string
  providerConnectionId: string | null
  platform: Platform
  accountType: string
  externalAccountId: string | null
  displayName: string
  handle: string | null
  profileUrl: string | null
  avatarUrl: string | null
  publishingCapability: PublishingCapability
  connectionStatus: ConnectionStatus
  metadata: Record<string, unknown>
  isActive: boolean
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProviderConnectionInput {
  platform: Platform
  accountId: string
  accountLabel: string
  accessToken: string
  refreshToken?: string | null
  expiresAt?: Date | null
  scopes?: string[]
}

export interface SocialAccountInput {
  providerConnectionId?: string | null
  platform: Platform
  accountType: string
  externalAccountId?: string | null
  displayName: string
  handle?: string | null
  profileUrl?: string | null
  avatarUrl?: string | null
  publishingCapability?: PublishingCapability
  connectionStatus?: ConnectionStatus
  metadata?: Record<string, unknown>
  lastVerifiedAt?: Date | string | null
}

let client: SupabaseClient | null = null

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('SUPABASE_URL is required')
  if (!key) throw new Error('SUPABASE_SECRET_KEY is required')

  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return client
}

export async function listSocialAccounts(): Promise<SocialAccountRow[]> {
  const { data, error } = await admin()
    .from('social_hub_accounts')
    .select('*')
    .eq('isActive', true)
    .order('platform', { ascending: true })
    .order('displayName', { ascending: true })

  if (error) throw new Error(`[accounts:list] ${error.message}`)
  return (data || []) as SocialAccountRow[]
}

export async function upsertProviderConnection(input: ProviderConnectionInput) {
  const db = admin()
  const { data: existing, error: findError } = await db
    .from('social_hub_platform_connections')
    .select('id')
    .eq('platform', input.platform)
    .eq('accountId', input.accountId)
    .is('brandId', null)
    .maybeSingle()

  if (findError) throw new Error(`[connections:find] ${findError.message}`)

  const payload = {
    brandId: null,
    platform: input.platform,
    accountId: input.accountId,
    accountLabel: input.accountLabel,
    accessToken: encrypt(input.accessToken),
    refreshToken: input.refreshToken ? encrypt(input.refreshToken) : null,
    expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    scopes: JSON.stringify(input.scopes || []),
    isActive: true,
    updatedAt: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await db
      .from('social_hub_platform_connections')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw new Error(`[connections:update] ${error.message}`)
    return data
  }

  const { data, error } = await db
    .from('social_hub_platform_connections')
    .insert({ id: crypto.randomUUID(), ...payload })
    .select('*')
    .single()
  if (error) throw new Error(`[connections:create] ${error.message}`)
  return data
}

export async function upsertSocialAccount(input: SocialAccountInput): Promise<SocialAccountRow> {
  const db = admin()
  const externalId = input.externalAccountId?.trim() || null
  const now = new Date().toISOString()

  let existingId: string | null = null
  if (externalId) {
    const { data: existing, error: findError } = await db
      .from('social_hub_accounts')
      .select('id')
      .eq('platform', input.platform)
      .eq('externalAccountId', externalId)
      .maybeSingle()
    if (findError) throw new Error(`[accounts:find] ${findError.message}`)
    existingId = existing?.id || null
  }

  const payload = {
    providerConnectionId: input.providerConnectionId || null,
    platform: input.platform,
    accountType: input.accountType,
    externalAccountId: externalId,
    displayName: input.displayName.trim(),
    handle: input.handle?.trim() || null,
    profileUrl: input.profileUrl?.trim() || null,
    avatarUrl: input.avatarUrl?.trim() || null,
    publishingCapability: input.publishingCapability || 'MANUAL',
    connectionStatus: input.connectionStatus || 'CONNECTED',
    metadata: input.metadata || {},
    isActive: true,
    lastVerifiedAt:
      input.lastVerifiedAt instanceof Date
        ? input.lastVerifiedAt.toISOString()
        : input.lastVerifiedAt || now,
    updatedAt: now,
  }

  if (existingId) {
    const { data, error } = await db
      .from('social_hub_accounts')
      .update(payload)
      .eq('id', existingId)
      .select('*')
      .single()
    if (error) throw new Error(`[accounts:update] ${error.message}`)
    return data as SocialAccountRow
  }

  const { data, error } = await db
    .from('social_hub_accounts')
    .insert({ id: crypto.randomUUID(), ...payload })
    .select('*')
    .single()
  if (error) throw new Error(`[accounts:create] ${error.message}`)
  return data as SocialAccountRow
}

export async function createManualSocialAccount(input: Omit<SocialAccountInput, 'providerConnectionId'>) {
  return upsertSocialAccount({
    ...input,
    providerConnectionId: null,
    publishingCapability: input.publishingCapability || 'MANUAL',
    connectionStatus: 'DISCONNECTED',
    lastVerifiedAt: null,
  })
}

export async function deactivateSocialAccount(id: string): Promise<void> {
  const { error } = await admin()
    .from('social_hub_accounts')
    .update({ isActive: false, updatedAt: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`[accounts:deactivate] ${error.message}`)
}

export async function markAccountsDisconnectedForConnection(providerConnectionId: string): Promise<void> {
  const { error } = await admin()
    .from('social_hub_accounts')
    .update({
      providerConnectionId: null,
      connectionStatus: 'DISCONNECTED',
      updatedAt: new Date().toISOString(),
    })
    .eq('providerConnectionId', providerConnectionId)
  if (error) throw new Error(`[accounts:disconnect] ${error.message}`)
}
