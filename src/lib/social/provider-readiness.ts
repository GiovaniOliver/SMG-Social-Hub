import 'server-only'

export type SocialProviderId = 'meta' | 'youtube' | 'linkedin' | 'tiktok' | 'x' | 'reddit'

export interface SocialProviderReadiness {
  id: SocialProviderId
  ready: boolean
  missing: string[]
  warnings: string[]
  authMethod: 'oauth' | 'arcade'
  callbackUrl: string | null
}

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://social.socialtizemg.com'
  ).replace(/\/$/, '')
}

function oauthReadiness(
  id: SocialProviderId,
  required: string[],
  callbackEnv: string,
  callbackPath: string
): SocialProviderReadiness {
  const missing = required.filter((name) => !envPresent(name))
  const warnings: string[] = []
  const expected = `${appOrigin()}${callbackPath}`
  const configuredCallback = process.env[callbackEnv]?.trim()

  if (configuredCallback && configuredCallback !== expected) {
    warnings.push(`${callbackEnv} should be ${expected}`)
  }

  return {
    id,
    ready: missing.length === 0 && warnings.length === 0,
    missing,
    warnings,
    authMethod: 'oauth',
    callbackUrl: expected,
  }
}

function arcadeReadiness(id: 'x' | 'reddit'): SocialProviderReadiness {
  const missing = envPresent('ARCADE_API_KEY') ? [] : ['ARCADE_API_KEY']
  return {
    id,
    ready: missing.length === 0,
    missing,
    warnings: [],
    authMethod: 'arcade',
    callbackUrl: `${appOrigin()}/api/oauth/${id}/callback`,
  }
}

export function getSocialProviderReadiness(): SocialProviderReadiness[] {
  return [
    oauthReadiness(
      'meta',
      ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'],
      'FACEBOOK_REDIRECT_URI',
      '/api/oauth/facebook/callback'
    ),
    oauthReadiness(
      'youtube',
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      'GOOGLE_REDIRECT_URI',
      '/api/oauth/google/callback'
    ),
    oauthReadiness(
      'linkedin',
      ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'],
      'LINKEDIN_REDIRECT_URI',
      '/api/oauth/linkedin/callback'
    ),
    oauthReadiness(
      'tiktok',
      ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'],
      'TIKTOK_REDIRECT_URI',
      '/api/oauth/tiktok/callback'
    ),
    arcadeReadiness('x'),
    arcadeReadiness('reddit'),
  ]
}
