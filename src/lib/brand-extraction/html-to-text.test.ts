import { describe, it, expect } from 'vitest'
import { stripHtmlToText } from './html-to-text'

describe('stripHtmlToText', () => {
  it('removes script tag contents', () => {
    expect(stripHtmlToText('<p>Hello</p><script>alert(1)</script><p>World</p>')).toBe('Hello World')
  })

  it('removes style tag contents', () => {
    expect(stripHtmlToText('<style>.a{color:red}</style><p>Hello</p>')).toBe('Hello')
  })

  it('strips remaining tags leaving text', () => {
    expect(stripHtmlToText('<div><h1>Title</h1><p>Body text</p></div>')).toBe('Title Body text')
  })

  it('decodes common HTML entities', () => {
    expect(stripHtmlToText('<p>Tom &amp; Jerry &lt;3 &quot;fun&quot;</p>')).toBe('Tom & Jerry <3 "fun"')
  })

  it('collapses repeated whitespace and newlines', () => {
    expect(stripHtmlToText('<p>Hello\n\n\n   World</p>')).toBe('Hello World')
  })

  it('truncates to the default max length', () => {
    const longText = `<p>${'a'.repeat(10000)}</p>`
    expect(stripHtmlToText(longText).length).toBe(8000)
  })

  it('respects a custom maxChars', () => {
    expect(stripHtmlToText('<p>hello world</p>', 5)).toBe('hello')
  })
})
