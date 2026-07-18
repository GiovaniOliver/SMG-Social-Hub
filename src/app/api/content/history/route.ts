import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
  }
  try {
    const items = await prisma.generatedContent.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ success: true, data: items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch content history'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
