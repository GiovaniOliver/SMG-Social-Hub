import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'logos')
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

export function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-')
}

export function isAllowedImageExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.includes(path.extname(filename).toLowerCase())
}

export function isWithinSizeLimit(byteLength: number): boolean {
  return byteLength <= MAX_BYTES
}

export function saveLogoBuffer(buffer: Buffer, originalFilename: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const filename = `${randomUUID()}-${sanitizeFilename(originalFilename)}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return `/uploads/logos/${filename}`
}
