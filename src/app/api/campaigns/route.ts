import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  try {
    const campaigns = await db.campaign.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { content: true } } },
    })
    return NextResponse.json({ success: true, data: campaigns })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaigns'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
