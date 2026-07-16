import { NextRequest, NextResponse } from 'next/server'
import { isAllowedImageExtension, isWithinSizeLimit, saveLogoBuffer } from '@/lib/uploads'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    if (!isAllowedImageExtension(file.name)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Use PNG, JPG, SVG, or WEBP.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    if (!isWithinSizeLimit(arrayBuffer.byteLength)) {
      return NextResponse.json({ success: false, error: 'File too large (5MB max).' }, { status: 400 })
    }

    const url = saveLogoBuffer(Buffer.from(arrayBuffer), file.name)
    return NextResponse.json({ success: true, data: { url } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
