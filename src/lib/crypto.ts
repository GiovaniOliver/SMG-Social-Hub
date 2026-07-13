import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const SALT = 'smg-social-hub-salt'

function getDerivedKey(): Buffer {
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY

  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set')
  }

  if (encryptionKey.length < 16) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be at least 16 characters long')
  }

  return scryptSync(encryptionKey, SALT, 32)
}

export function encrypt(plaintext: string): string {
  const key = getDerivedKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

export function decrypt(encryptedString: string): string {
  const key = getDerivedKey()
  const parts = encryptedString.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format — expected iv:authTag:encrypted')
  }

  const [ivHex, authTagHex, encryptedHex] = parts

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encryptedData = Buffer.from(encryptedHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
