import { describe, it, expect } from 'vitest'
import { assessReplyRisk } from './risk-filter'

describe('assessReplyRisk', () => {
  it('returns LOW with no flags for a benign exchange', () => {
    const result = assessReplyRisk(
      'How do I register my new blender?',
      'Great question! Head to the setup page and follow the three steps.'
    )
    expect(result.riskLevel).toBe('LOW')
    expect(result.flags).toEqual([])
    expect(result.requiresHumanReview).toBe(false)
  })

  it('flags HIGH when the comment contains a legal threat', () => {
    const result = assessReplyRisk(
      'I am going to sue you, this is fraud!',
      'Sorry to hear that — let me connect you with our support team.'
    )
    expect(result.riskLevel).toBe('HIGH')
    expect(result.requiresHumanReview).toBe(true)
    expect(result.flags.some((f) => f.startsWith('High-risk terms detected'))).toBe(true)
  })

  it('flags HIGH when the comment demands a refund or chargeback', () => {
    expect(assessReplyRisk('I want a refund now', 'Understood.').riskLevel).toBe('HIGH')
    expect(assessReplyRisk('I will file a chargeback', 'Okay.').riskLevel).toBe('HIGH')
  })

  it('escalates to HIGH when the DRAFT contains commitment language even if the comment is benign', () => {
    const result = assessReplyRisk(
      'Does this come with a warranty?',
      'Yes, we guarantee a full refund if it ever breaks.'
    )
    expect(result.riskLevel).toBe('HIGH')
    expect(result.requiresHumanReview).toBe(true)
    expect(
      result.flags.some((f) => f.startsWith('Draft reply contains commitment language'))
    ).toBe(true)
  })

  it('returns MEDIUM for sensitive complaint language without legal/commitment terms', () => {
    const result = assessReplyRisk(
      'The product arrived broken and defective',
      'So sorry about that — here is how to get a replacement.'
    )
    expect(result.riskLevel).toBe('MEDIUM')
    expect(result.requiresHumanReview).toBe(true)
    expect(result.flags.some((f) => f.startsWith('Sensitive terms detected'))).toBe(true)
  })

  it('is case-insensitive when matching keywords', () => {
    const result = assessReplyRisk('This is a SCAM and FRAUD', 'Let me help.')
    expect(result.riskLevel).toBe('HIGH')
  })

  it('matches multi-word phrases like "class action" and "does not work"', () => {
    expect(assessReplyRisk('we are starting a class action', 'ok').riskLevel).toBe('HIGH')
    expect(assessReplyRisk('the app does not work at all', 'ok').riskLevel).toBe('MEDIUM')
  })

  it('scans both the comment and the draft reply for high-risk terms', () => {
    const result = assessReplyRisk(
      'Just a normal question',
      'You should contact the Better Business Bureau.'
    )
    expect(result.riskLevel).toBe('HIGH')
  })

  it('lists every matched high-risk term in the flag', () => {
    const result = assessReplyRisk('scam and fraud and lawsuit', 'ok')
    const highFlag = result.flags.find((f) => f.startsWith('High-risk terms detected'))
    expect(highFlag).toBeDefined()
    expect(highFlag).toContain('scam')
    expect(highFlag).toContain('fraud')
    expect(highFlag).toContain('lawsuit')
  })

  it('prioritises HIGH over MEDIUM when both are present', () => {
    const result = assessReplyRisk(
      'the product is broken and I will sue',
      'ok'
    )
    expect(result.riskLevel).toBe('HIGH')
    // both a sensitive and a high-risk flag should be present
    expect(result.flags.some((f) => f.startsWith('Sensitive terms detected'))).toBe(true)
    expect(result.flags.some((f) => f.startsWith('High-risk terms detected'))).toBe(true)
  })
})
