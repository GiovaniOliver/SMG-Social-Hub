import fs from 'fs'
import path from 'path'
import { readFileAsText, isRecognizedTextFile, isLikelyLogoFile } from './file-readers'

const MAX_FILES = 20
const MAX_TOTAL_CHARS = 20000

export interface FolderScanResult {
  text: string
  sourceNote: string
  suggestedLogoPath: string | null
}

export async function scanFolder(folderPath: string): Promise<FolderScanResult> {
  const stat = fs.statSync(folderPath)
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${folderPath}`)
  }

  const entries = fs.readdirSync(folderPath)
  const filePaths = entries
    .map((name) => path.join(folderPath, name))
    .filter((p) => fs.lstatSync(p).isFile())

  const suggestedLogoPath = filePaths.find((p) => isLikelyLogoFile(p)) ?? null

  const textFiles = filePaths.filter((p) => isRecognizedTextFile(p)).slice(0, MAX_FILES)

  const chunks: string[] = []
  let totalChars = 0
  let filesRead = 0

  for (const filePath of textFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break
    try {
      const text = await readFileAsText(filePath)
      if (!text) continue
      chunks.push(`--- ${path.basename(filePath)} ---\n${text}`)
      totalChars += text.length
      filesRead += 1
    } catch {
      // Skip unreadable files — a bad file shouldn't fail the whole scan.
    }
  }

  return {
    text: chunks.join('\n\n').slice(0, MAX_TOTAL_CHARS),
    sourceNote: `Extracted from ${filesRead} file${filesRead === 1 ? '' : 's'} in ${folderPath}`,
    suggestedLogoPath,
  }
}
