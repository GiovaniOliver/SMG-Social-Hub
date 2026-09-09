import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs'
import { scanFolder } from '@/lib/brand-extraction/folder-walker'
import { buildExtractionPrompt, parseExtractionResponse } from '@/lib/brand-extraction/prompt'
import { generateText } from '@/lib/ai/providers'
import { isWithinSizeLimit, saveLogoBuffer } from '@/lib/uploads'

const schema = z.object({ folderPath: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'A folder path is required' }, { status: 400 })
    }

    const { folderPath } = parsed.data
    const { text, sourceNote, suggestedLogoPath } = await scanFolder(folderPath)

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'No readable .txt, .md, .docx, or .pdf files found in that folder' },
        { status: 400 }
      )
    }

    let suggestedLogoUrl: string | undefined
    if (suggestedLogoPath) {
      const buffer = fs.readFileSync(suggestedLogoPath)
      if (isWithinSizeLimit(buffer.byteLength)) {
        suggestedLogoUrl = await saveLogoBuffer(buffer, suggestedLogoPath.split(/[\\/]/).pop() ?? 'logo.png')
      }
    }

    const prompt = buildExtractionPrompt(text, sourceNote)
    const raw = await generateText(prompt, { jsonMode: true, maxTokens: 1024 })
    const info = parseExtractionResponse(raw, sourceNote)

    return NextResponse.json({ success: true, data: { ...info, suggestedLogoUrl } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scan folder'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
