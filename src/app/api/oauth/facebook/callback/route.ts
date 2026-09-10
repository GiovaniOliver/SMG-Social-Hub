import { NextRequest } from 'next/server'
import { verifyOAuthState } from '@/lib/security/oauth-state'
import { upsertProviderConnection, upsertSocialAccount } from '@/lib/social-accounts'

interface FacebookTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface FacebookLongLivedTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface FacebookUser {
  id: string
  name: string
  picture?: { data?: { url?: string } }
}

interface FacebookPage {
  id: string
  name: string
  access_token?: string
  tasks?: string[]
  instagram_business_account?: { id: string }
}

interface FacebookPagesResponse {
  data: FacebookPage[]
}

interface InstagramProfile {
  id: string
  username?: string
  name?: string
  profile_picture_url?: string
}

async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
  graphVersion: string
): Promise<FacebookTokenResponse> {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })

  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Facebook token exchange failed (${res.status})`)
  return res.json()
}

async function getLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
  graphVersion: string
): Promise<FacebookLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })

  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Facebook long-lived token exchange failed (${res.status})`)
  return res.json()
}

async function getFacebookUser(userToken: string, graphVersion: string): Promise<FacebookUser> {
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me?fields=id,name,picture`,
    { headers: { Authorization: `Bearer ${userToken}` }, cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Facebook profile discovery failed (${res.status})`)
  return res.json()
}

async function getPages(userToken: string, graphVersion: string): Promise<FacebookPagesResponse> {
  const fields = encodeURIComponent('id,name,access_token,tasks,instagram_business_account')
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/me/accounts?fields=${fields}`,
    { headers: { Authorization: `Bearer ${userToken}` }, cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Facebook Page discovery failed (${res.status})`)
  return res.json()
}

async function getInstagramProfile(
  instagramId: string,
  accessToken: string,
  graphVersion: string
): Promise<InstagramProfile | null> {
  const fields = encodeURIComponent('id,username,name,profile_picture_url')
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/${instagramId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateValue = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (errorParam) {
    const desc = searchParams.get('error_description') ?? 'Meta authorization was denied'
    return Response.redirect(`${appUrl}/accounts?error=${encodeURIComponent(desc)}`)
  }

  if (!code || !stateValue) {
    return Response.redirect(`${appUrl}/accounts?error=Missing+code+or+state`)
  }

  const state = await verifyOAuthState(stateValue, 'facebook')
  if (!state) {
    return Response.redirect(`${appUrl}/accounts?error=Invalid+or+expired+OAuth+state`)
  }

  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI
  const graphVersion = process.env.META_GRAPH_VERSION || 'v26.0'

  if (!appId || !appSecret || !redirectUri) {
    return Response.redirect(`${appUrl}/accounts?error=Facebook+OAuth+not+configured`)
  }

  try {
    const shortToken = await exchangeCodeForToken(code, appId, appSecret, redirectUri, graphVersion)
    const longToken = await getLongLivedToken(shortToken.access_token, appId, appSecret, graphVersion)
    const user = await getFacebookUser(longToken.access_token, graphVersion)
    const pages = await getPages(longToken.access_token, graphVersion)
    const userExpiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000)
      : null

    const loginConnection = await upsertProviderConnection({
      platform: 'FACEBOOK',
      accountId: `meta-user:${user.id}`,
      accountLabel: `${user.name} (Meta login)`,
      accessToken: longToken.access_token,
      expiresAt: userExpiresAt,
      scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'instagram_basic', 'instagram_content_publish'],
    })

    await upsertSocialAccount({
      providerConnectionId: loginConnection.id,
      platform: 'FACEBOOK',
      accountType: 'LOGIN_PROFILE',
      externalAccountId: user.id,
      displayName: user.name,
      avatarUrl: user.picture?.data?.url || null,
      publishingCapability: 'UNSUPPORTED',
      connectionStatus: 'CONNECTED',
      metadata: {
        source: 'meta_oauth',
        note: 'Facebook login identity. Publishing is performed through supported Page identities.',
      },
      lastVerifiedAt: new Date(),
    })

    let facebookPages = 0
    let instagramAccounts = 0

    for (const page of pages.data || []) {
      const pageToken = page.access_token || longToken.access_token
      const canCreate = (page.tasks || []).some((task) => task === 'CREATE_CONTENT' || task === 'MANAGE')

      const pageConnection = await upsertProviderConnection({
        platform: 'FACEBOOK',
        accountId: page.id,
        accountLabel: page.name,
        accessToken: pageToken,
        expiresAt: page.access_token ? null : userExpiresAt,
        scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
      })

      await upsertSocialAccount({
        providerConnectionId: pageConnection.id,
        platform: 'FACEBOOK',
        accountType: 'PAGE',
        externalAccountId: page.id,
        displayName: page.name,
        profileUrl: `https://www.facebook.com/${page.id}`,
        publishingCapability: page.access_token && canCreate ? 'AUTOMATIC' : 'READ_ONLY',
        connectionStatus: 'CONNECTED',
        metadata: { tasks: page.tasks || [], source: 'meta_oauth' },
        lastVerifiedAt: new Date(),
      })
      facebookPages += 1

      const instagramId = page.instagram_business_account?.id
      if (!instagramId) continue

      const instagram = await getInstagramProfile(instagramId, pageToken, graphVersion)
      const instagramConnection = await upsertProviderConnection({
        platform: 'INSTAGRAM',
        accountId: instagramId,
        accountLabel: instagram?.username ? `@${instagram.username}` : instagram?.name || page.name,
        accessToken: pageToken,
        expiresAt: page.access_token ? null : userExpiresAt,
        scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
      })

      await upsertSocialAccount({
        providerConnectionId: instagramConnection.id,
        platform: 'INSTAGRAM',
        accountType: 'PROFESSIONAL',
        externalAccountId: instagramId,
        displayName: instagram?.name || instagram?.username || `${page.name} Instagram`,
        handle: instagram?.username ? `@${instagram.username.replace(/^@/, '')}` : null,
        profileUrl: instagram?.username ? `https://www.instagram.com/${instagram.username.replace(/^@/, '')}/` : null,
        avatarUrl: instagram?.profile_picture_url || null,
        publishingCapability: page.access_token ? 'AUTOMATIC' : 'READ_ONLY',
        connectionStatus: 'CONNECTED',
        metadata: { linkedFacebookPageId: page.id, linkedFacebookPageName: page.name, source: 'meta_oauth' },
        lastVerifiedAt: new Date(),
      })
      instagramAccounts += 1
    }

    const message = `Meta connected: ${facebookPages} Facebook Page${facebookPages === 1 ? '' : 's'} and ${instagramAccounts} Instagram account${instagramAccounts === 1 ? '' : 's'} imported`
    return Response.redirect(`${appUrl}/accounts?success=${encodeURIComponent(message)}`)
  } catch (error) {
    console.error('[oauth:facebook]', error)
    return Response.redirect(
      `${appUrl}/accounts?error=${encodeURIComponent('Meta connection failed. Check the app permissions and try again.')}`
    )
  }
}
