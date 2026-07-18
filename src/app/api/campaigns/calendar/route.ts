import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  try {
    const pieces = await prisma.contentPiece.findMany({
      where: { brandId },
      orderBy: { day: 'asc' },
      include: { campaign: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ success: true, data: pieces })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch calendar'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
