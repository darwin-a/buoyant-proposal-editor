import { describe, it, expect } from 'vitest'
import { blocksToMarkdown, markdownFilename } from './markdown'
import type { Block } from './parse'

const b = (type: Block['type'], text: string, level?: number): Block => ({ id: Math.random().toString(), type, text, ...(level ? { level } : {}) })

describe('blocksToMarkdown', () => {
  it('renders headings by level and paragraphs as text, blank-line separated', () => {
    const md = blocksToMarkdown([b('heading', 'OUR FIRM', 1), b('paragraph', 'We serve municipalities.'), b('heading', 'Sub', 2)])
    expect(md).toBe('# OUR FIRM\n\nWe serve municipalities.\n\n## Sub')
  })
  it('defaults a level-less heading to H1 and skips empty blocks', () => {
    const md = blocksToMarkdown([b('heading', 'Title'), b('paragraph', '   '), b('paragraph', 'Body')])
    expect(md).toBe('# Title\n\nBody')
  })
  it('clamps heading level to 6', () => {
    expect(blocksToMarkdown([b('heading', 'Deep', 9)])).toBe('###### Deep')
  })
})

describe('markdownFilename', () => {
  it('slugs the first heading', () => {
    expect(markdownFilename([b('heading', 'City of Dixon SOQ', 1), b('paragraph', 'x')])).toBe('city-of-dixon-soq.md')
  })
  it('falls back when there is no heading', () => {
    expect(markdownFilename([b('paragraph', 'just text')])).toBe('proposal.md')
  })
})
