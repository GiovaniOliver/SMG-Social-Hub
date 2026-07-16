import { describe, it, expect, vi, beforeEach } from 'vitest'

const { statSync, lstatSync, readdirSync } = vi.hoisted(() => ({
  statSync: vi.fn(),
  lstatSync: vi.fn(),
  readdirSync: vi.fn(),
}))
vi.mock('fs', () => ({
  default: { statSync, lstatSync, readdirSync },
  statSync,
  lstatSync,
  readdirSync,
}))

const { readFileAsText } = vi.hoisted(() => ({ readFileAsText: vi.fn() }))
vi.mock('./file-readers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./file-readers')>()
  return { ...actual, readFileAsText }
})

import { scanFolder } from './folder-walker'
import path from 'path'

function fileStat() {
  return { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }
}
function dirStat() {
  return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }
}
function symlinkStat() {
  return { isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true }
}

beforeEach(() => {
  statSync.mockReset()
  lstatSync.mockReset()
  readdirSync.mockReset()
  readFileAsText.mockReset()
})

describe('scanFolder', () => {
  it('throws when the path is not a directory', async () => {
    statSync.mockReturnValue(fileStat())
    await expect(scanFolder('/not-a-dir')).rejects.toThrow(/Not a directory/)
  })

  it('reads recognized files and concatenates their text', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation(() => fileStat())
    readdirSync.mockReturnValue(['notes.txt', 'ignore.xlsx'])
    readFileAsText.mockResolvedValue('brand notes here')

    const result = await scanFolder('/brand')

    expect(result.text).toContain('brand notes here')
    expect(result.text).toContain('notes.txt')
    expect(readFileAsText).toHaveBeenCalledTimes(1)
    expect(readFileAsText).toHaveBeenCalledWith(path.join('/brand', 'notes.txt'))
  })

  it('detects a suggested logo file', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation(() => fileStat())
    readdirSync.mockReturnValue(['logo.png', 'notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.suggestedLogoPath).toBe(path.join('/brand', 'logo.png'))
  })

  it('returns a null suggestedLogoPath when no logo file is found', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation(() => fileStat())
    readdirSync.mockReturnValue(['notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.suggestedLogoPath).toBeNull()
  })

  it('continues past a file that throws during read', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation(() => fileStat())
    readdirSync.mockReturnValue(['bad.txt', 'good.txt'])
    readFileAsText.mockImplementation(async (p: string) => {
      if (p.includes('bad.txt')) throw new Error('read error')
      return 'good content'
    })

    const result = await scanFolder('/brand')

    expect(result.text).toContain('good content')
  })

  it('caps the number of files read to 20', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation(() => fileStat())
    const files = Array.from({ length: 30 }, (_, i) => `file${i}.txt`)
    readdirSync.mockReturnValue(files)
    readFileAsText.mockResolvedValue('x')

    await scanFolder('/brand')

    expect(readFileAsText).toHaveBeenCalledTimes(20)
  })

  it('produces a singular sourceNote when exactly one file is read', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation(() => fileStat())
    readdirSync.mockReturnValue(['notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.sourceNote).toBe('Extracted from 1 file in /brand')
  })

  it('skips symlinked entries even when they point at a file', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation((p: string) => (p.includes('sneaky-link') ? symlinkStat() : fileStat()))
    readdirSync.mockReturnValue(['notes.txt', 'sneaky-link.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(readFileAsText).toHaveBeenCalledTimes(1)
    expect(readFileAsText).toHaveBeenCalledWith(path.join('/brand', 'notes.txt'))
  })

  it('does not treat a symlinked logo file as the suggested logo', async () => {
    statSync.mockImplementation((p: string) => (p === '/brand' ? dirStat() : fileStat()))
    lstatSync.mockImplementation((p: string) => (p.includes('logo.png') ? symlinkStat() : fileStat()))
    readdirSync.mockReturnValue(['logo.png', 'notes.txt'])
    readFileAsText.mockResolvedValue('notes')

    const result = await scanFolder('/brand')

    expect(result.suggestedLogoPath).toBeNull()
  })
})
