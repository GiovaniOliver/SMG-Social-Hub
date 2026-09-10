import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { markAccountsDisconnectedForConnection } from '@/lib/social-accounts'

const QuerySchema = z.object({
  brandId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = QuerySchema.safeParse({ brandId: searchParams.get('brandId') ?? undefined })

    if (!query.success) {
      return Response.json({ success: false, error: 'Invalid query' }, { status: 400 })
    }

    const where = query.data.brandId
      ? { brandId: query.data.brandId, isActive: true }
      : { isActive: true }

    const connections = await db.platformConnection.findMany({
      where,
      select: {
        id: true,
        brandId: true,
        platform: true,
        accountId: true,
        accountLabel: true,
        expiresAt: true,
        scopes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { platform: 'asc' },
    })

    return Response.json({ success: true, data: connections })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch connections'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ success: false, error: 'Connection id is required' }, { status: 400 })
    }

    const connection = await db.platformConnection.findUnique({ where: { id } })
    if (!connection) {
      return Response.json({ success: false, error: 'Connection not found' }, { status: 404 })
    }

    await markAccountsDisconnectedForConnection(id)
    await db.platformConnection.delete({ where: { id } })

    return Response.json({ success: true, data: { deleted: true, id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete connection'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
