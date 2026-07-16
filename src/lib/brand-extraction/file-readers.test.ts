import { describe, it, expect, vi, beforeEach } from 'vitest'

const { readFileSync } = vi.hoisted(() => ({ readFileSync: vi.fn() }))
vi.mock('fs', () => ({ default: { readFileSync }, readFileSync }))

const { extractRawText } = vi.hoisted(() => ({ extractRawText: vi.fn() }))
vi.mock('mammoth', () => ({ extractRawText }))

const { pdfParseFn } = vi.hoisted(() => ({ pdfParseFn: vi.fn() }))
vi.mock('pdf-parse', () => ({ default: pdfParseFn }))

import { readFileAsText, isRecognizedTextFile, isLikelyLogoFile } from './file-readers'

beforeEach(() => {
  readFileSync.mockReset()
  extractRawText.mockReset()
  pdfParseFn.mockReset()
})

describe('readFileAsText', () => {
  it('reads .txt files directly', async () => {
    readFileSync.mockReturnValue('plain text content')
    expect(await readFileAsText('/brand/notes.txt')).toBe('plain text content')
  })

  it('reads .md files directly', async () => {
    readFileSync.mockReturnValue('# Heading\n\nBody')
    expect(await readFileAsText('/brand/notes.md')).toBe('# Heading\n\nBody')
  })

  it('truncates long text files to 4000 chars', async () => {
    readFileSync.mockReturnValue('a'.repeat(5000))
    const result = await readFileAsText('/brand/notes.txt')
    expect(result.length).toBe(4000)
  })

  it('reads .docx files via mammoth', async () => {
    extractRawText.mockResolvedValue({ value: 'docx contents' })
    const result = await readFileAsText('/brand/guidelines.docx')
    expect(extractRawText).toHaveBeenCalledWith({ path: '/brand/guidelines.docx' })
    expect(result).toBe('docx contents')
  })

  it('reads .pdf files via pdf-parse', async () => {
    readFileSync.mockReturnValue(Buffer.from('fake-pdf-bytes'))
    pdfParseFn.mockResolvedValue({ text: 'pdf contents' })
    const result = await readFileAsText('/brand/guidelines.pdf')
    expect(pdfParseFn).toHaveBeenCalledWith(Buffer.from('fake-pdf-bytes'))
    expect(result).toBe('pdf contents')
  })

  it('throws on an unsupported extension', async () => {
    await expect(readFileAsText('/brand/logo.png')).rejects.toThrow(/Unsupported file type/)
  })
})

describe('isRecognizedTextFile', () => {
  it('accepts .txt, .md, .docx, .pdf case-insensitively', () => {
    expect(isRecognizedTextFile('a.TXT')).toBe(true)
    expect(isRecognizedTextFile('a.md')).toBe(true)
    expect(isRecognizedTextFile('a.DOCX')).toBe(true)
    expect(isRecognizedTextFile('a.pdf')).toBe(true)
  })

  it('rejects other extensions', () => {
    expect(isRecognizedTextFile('a.png')).toBe(false)
    expect(isRecognizedTextFile('a.xlsx')).toBe(false)
  })
})

describe('isLikelyLogoFile', () => {
  it('matches logo.png/jpg/jpeg/svg/webp case-insensitively', () => {
    expect(isLikelyLogoFile('/x/logo.png')).toBe(true)
    expect(isLikelyLogoFile('/x/Logo.JPG')).toBe(true)
    expect(isLikelyLogoFile('/x/logo.svg')).toBe(true)
  })

  it('rejects non-matching filenames', () => {
    expect(isLikelyLogoFile('/x/brand-logo.png')).toBe(false)
    expect(isLikelyLogoFile('/x/logo.txt')).toBe(false)
  })
})
