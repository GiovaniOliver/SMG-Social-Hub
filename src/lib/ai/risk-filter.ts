const HIGH_RISK_KEYWORDS = [
  'lawyer',
  'lawsuit',
  'sue',
  'suing',
  'legal',
  'fraud',
  'scam',
  'fake',
  'refund',
  'chargeback',
  'BBB',
  'Better Business Bureau',
  'attorney general',
  'class action',
  'court',
  'attorney',
  'solicitor',
]

const MEDIUM_RISK_KEYWORDS = [
  'denied',
  'refused',
  'broken',
  'defective',
  'dangerous',
  'injury',
  'hurt',
  'damaged',
  'not working',
  'doesn\'t work',
  'does not work',
  'terrible',
  'horrible',
  'worst',
  'never again',
]

export interface RiskAssessment {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  flags: string[]
  requiresHumanReview: boolean
}

function tokenize(text: string): string {
  return text.toLowerCase()
}

function findMatches(text: string, keywords: string[]): string[] {
  const normalized = tokenize(text)
  return keywords.filter((kw) => normalized.includes(kw.toLowerCase()))
}

export function assessReplyRisk(commentText: string, draftReply: string): RiskAssessment {
  const combined = `${commentText} ${draftReply}`

  const highMatches = findMatches(combined, HIGH_RISK_KEYWORDS)
  const mediumMatches = findMatches(combined, MEDIUM_RISK_KEYWORDS)

  const flags: string[] = []

  if (highMatches.length > 0) {
    flags.push(`High-risk terms detected: ${highMatches.join(', ')}`)
  }

  if (mediumMatches.length > 0) {
    flags.push(`Sensitive terms detected: ${mediumMatches.join(', ')}`)
  }

  // Check if the draft reply makes any promises or legal statements
  const promiseKeywords = ['guarantee', 'promise', 'legal', 'compensate', 'reimburse', 'lawsuit']
  const replyPromises = findMatches(draftReply, promiseKeywords)
  if (replyPromises.length > 0) {
    flags.push(`Draft reply contains commitment language: ${replyPromises.join(', ')}`)
  }

  if (highMatches.length > 0 || replyPromises.length > 0) {
    return {
      riskLevel: 'HIGH',
      flags,
      requiresHumanReview: true,
    }
  }

  if (mediumMatches.length > 0) {
    return {
      riskLevel: 'MEDIUM',
      flags,
      requiresHumanReview: true,
    }
  }

  return {
    riskLevel: 'LOW',
    flags,
    requiresHumanReview: false,
  }
}
