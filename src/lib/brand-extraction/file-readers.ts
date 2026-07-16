import fs from 'fs'
import path from 'path'

const MAX_CHARS_PER_FILE = 4000
const RECOGNIZED_EXTENSIONS = ['.txt', '.md', '.docx', '.pdf']
const LOGO_FILENAME_PATTERN = /^logo\.(png|jpe?g|svg|webp)$/i

export async function readFileAsText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.txt' || ext === '.md') {
    return truncate(fs.readFileSync(filePath, 'utf-8'))
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return truncate(result.value)
  }

  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = fs.readFileSync(filePath)
    const result = await pdfParse(buffer)
    return truncate(result.text)
  }

  throw new Error(`Unsupported file type: ${ext}`)
}

export function isRecognizedTextFile(filePath: string): boolean {
  return RECOGNIZED_EXTENSIONS.includes(path.extname(filePath).toLowerCase())
}

export function isLikelyLogoFile(filePath: string): boolean {
  return LOGO_FILENAME_PATTERN.test(path.basename(filePath))
}

function truncate(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > MAX_CHARS_PER_FILE ? trimmed.slice(0, MAX_CHARS_PER_FILE) : trimmed
}
