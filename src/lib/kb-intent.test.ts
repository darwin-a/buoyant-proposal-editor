import { describe, it, expect } from 'vitest'
import { wantsGrounding } from './kb-intent'

describe('wantsGrounding', () => {
  it('is true for instructions that pull in real content', () => {
    for (const i of [
      'add a sentence about our bridge scour experience',
      'include details from our past work',
      'expand on our MoDOT grant experience',
      'mention a similar project',
      'elaborate with more detail',
    ])
      expect(wantsGrounding(i)).toBe(true)
  })
  it('is false for pure phrasing edits', () => {
    for (const i of ['tighten this', 'make it more formal', 'change Dixon to Walia', 'fix the typo']) expect(wantsGrounding(i)).toBe(false)
  })
})
