export const CONTENT_TYPES = {
  educational: 'Educational Tip / How-To',
  story: 'Brand Story / Personal Story',
  product: 'Product Showcase',
  pain_point: 'Pain Point + Solution',
  engagement: 'Engagement Question / Poll',
  behind_scenes: 'Behind the Scenes',
} as const

export type ContentType = keyof typeof CONTENT_TYPES
