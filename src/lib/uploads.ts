import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const BUCKET = 'social-hub-logos'
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

function getExtension(filename: string): string {
  const match = /\.[^.]+$/.exec(filename)
  return match ? match[0].toLowerCase() : ''
}

export function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-')
}

export function isAllowedImageExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.includes(getExtension(filename))
}

export function isWithinSizeLimit(byteLength: number): boolean {
  return byteLength <= MAX_BYTES
}

export function isValidLogoUrl(value: string): boolean {
  if (value.startsWith('/')) return true
  return /^https?:\/\//i.test(value)
}

function getStorageClient() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables are not set')
  }

  return createClient(url, serviceRoleKey)
}

export async function saveLogoBuffer(buffer: Buffer, originalFilename: string): Promise<string> {
  const filename = `${randomUUID()}-${sanitizeFilename(originalFilename)}`
  const supabase = getStorageClient()

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: `image/${getExtension(originalFilename).slice(1) || 'png'}`,
    upsert: false,
  })

  if (error) {
    throw new Error(`Failed to upload logo: ${error.message}`)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}
