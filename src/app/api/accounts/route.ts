import { NextRequest } from 'next/server'
import { z } from 'zod'
import { PLATFORMS, type Platform } from '@/types'
import {
  createManualSocialAccount,
  deactivateSocialAccount,
  listSocialAccounts,
} from '@/lib/social-accounts'

const PlatformSchema = z.enum(PLATFORMS as [Platform, ...Platform[]])

const CreateAccountSchema = z.object({
  platform: PlatformSchema,
  accountType: z.string().trim().min(1).max(80).default('PROFILE'),
  displayName: z.string().trim().min(1).max(200),
  handle: z.string().trim().max(200).optional().nullable(),
  profileUrl: z.string().url().optional().nullable().or(z.literal('')),
  avatarUrl: z.string().url().optional().nullable().or(z.literal('')),
  externalAccountId: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export async function GET() {
  try {
    const accounts = await listSocialAccounts()
    return Response.json({ success: true, data: accounts })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load social accounts'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateAccountSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.issues.map((issue) => issue.message).join(', ') },
      { status: 422 }
    )
  }

  try {
    const account = await createManualSocialAccount({
      platform: parsed.data.platform,
      accountType: parsed.data.accountType.toUpperCase().replace(/\s+/g, '_'),
      displayName: parsed.data.displayName,
      handle: parsed.data.handle || null,
      profileUrl: parsed.data.profileUrl || null,
      avatarUrl: parsed.data.avatarUrl || null,
      externalAccountId: parsed.data.externalAccountId || null,
      metadata: parsed.data.notes ? { notes: parsed.data.notes, source: 'manual' } : { source: 'manual' },
      publishingCapability: 'MANUAL',
      connectionStatus: 'DISCONNECTED',
    })
    return Response.json({ success: true, data: account }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add social account'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return Response.json({ success: false, error: 'Account id is required' }, { status: 400 })
  }

  try {
    await deactivateSocialAccount(id)
    return Response.json({ success: true, data: { id, deactivated: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove social account'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
