import { describe, it, expect } from 'vitest'
import { wantsGrounding, isStyleOnlyEdit } from './kb-intent'

describe('wantsGrounding', () => {
  it('is true for instructions that pull in real content', () => {
    for (const i of [
      'add a sentence about our bridge scour experience',
      'include details from our past work',
      'expand on our MoDOT grant experience',
      'mention a similar project',
      'elaborate with more detail',
      'talk about the project we did in Warrenton',
      'describe our demolition expertise',
    ])
      expect(wantsGrounding(i)).toBe(true)
  })
  it('is false for pure phrasing edits', () => {
    for (const i of ['tighten this', 'make it more formal', 'change Dixon to Walia', 'fix the typo']) expect(wantsGrounding(i)).toBe(false)
  })
})

describe('isStyleOnlyEdit', () => {
  it('is true for phrasing/formatting-only edits', () => {
    for (const i of ['tighten this', 'make it more formal', 'fix the grammar', 'change Dixon to Walia', 'replace MECO with the firm', 'shorten this paragraph'])
      expect(isStyleOnlyEdit(i)).toBe(true)
  })
  it('is false for edits that bring in content', () => {
    for (const i of ['talk about our Warrenton project', 'add our bridge experience', 'describe the demolition work'])
      expect(isStyleOnlyEdit(i)).toBe(false)
  })
})
