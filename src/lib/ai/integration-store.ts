import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'

export type IntegrationCategory = 'llm' | 'media' | 'local'
export type IntegrationProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama' | 'runware'

export interface StoredIntegration {
  provider: IntegrationProvider
  category: IntegrationCategory
  hasSecret: boolean
  baseUrl: string | null
  defaultModel: string | null
  enabled: boolean
  config: Record<string, unknown>
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return client
}

export async function getStoredIntegration(provider: IntegrationProvider): Promise<StoredIntegration | null> {
  const supabase = getClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('social_hub_ai_integrations')
    .select('provider,category,api_key_encrypted,base_url,default_model,enabled,config')
    .eq('provider', provider)
    .maybeSingle()

  if (error) throw new Error(`[ai-integrations:${provider}] ${error.message}`)
  if (!data) return null

  return {
    provider: data.provider as IntegrationProvider,
    category: data.category as IntegrationCategory,
    hasSecret: Boolean(data.api_key_encrypted),
    baseUrl: data.base_url ?? null,
    defaultModel: data.default_model ?? null,
    enabled: data.enabled !== false,
    config: (data.config ?? {}) as Record<string, unknown>,
  }
}

export async function getStoredSecret(provider: IntegrationProvider): Promise<string> {
  const supabase = getClient()
  if (!supabase) return ''

  const { data, error } = await supabase
    .from('social_hub_ai_integrations')
    .select('api_key_encrypted')
    .eq('provider', provider)
    .maybeSingle()

  if (error) throw new Error(`[ai-integrations:${provider}] ${error.message}`)
  if (!data?.api_key_encrypted) return ''
  return decrypt(data.api_key_encrypted)
}

export async function saveStoredIntegration(input: {
  provider: IntegrationProvider
  category: IntegrationCategory
  secret?: string
  clearSecret?: boolean
  baseUrl?: string | null
  defaultModel?: string | null
  enabled?: boolean
  config?: Record<string, unknown>
}): Promise<void> {
  const supabase = getClient()
  if (!supabase) throw new Error('Supabase server credentials are required to save AI integrations')

  const existing = await supabase
    .from('social_hub_ai_integrations')
    .select('api_key_encrypted,config')
    .eq('provider', input.provider)
    .maybeSingle()

  if (existing.error) throw new Error(`[ai-integrations:${input.provider}] ${existing.error.message}`)

  let encryptedSecret = existing.data?.api_key_encrypted ?? null
  if (input.clearSecret) encryptedSecret = null
  else if (input.secret) encryptedSecret = encrypt(input.secret)

  const payload = {
    provider: input.provider,
    category: input.category,
    api_key_encrypted: encryptedSecret,
    base_url: input.baseUrl ?? null,
    default_model: input.defaultModel ?? null,
    enabled: input.enabled ?? true,
    config: input.config ?? (existing.data?.config as Record<string, unknown> | null) ?? {},
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('social_hub_ai_integrations')
    .upsert(payload, { onConflict: 'provider' })

  if (error) throw new Error(`[ai-integrations:${input.provider}] ${error.message}`)
}
