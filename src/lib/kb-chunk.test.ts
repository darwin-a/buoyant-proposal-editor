import { describe, it, expect } from 'vitest'
import { chunkBlocks } from './kb-chunk'
import type { Block } from './parse'

const b = (type: Block['type'], text: string): Block => ({ id: Math.random().toString(), type, text })

describe('chunkBlocks', () => {
  it('groups consecutive paragraphs under their nearest heading', () => {
    const out = chunkBlocks([b('heading', 'BRIDGE EXPERIENCE'), b('paragraph', 'We rehabilitated the span.'), b('paragraph', 'We managed scour.')])
    expect(out).toHaveLength(1)
    expect(out[0].heading).toBe('BRIDGE EXPERIENCE')
    expect(out[0].text).toContain('rehabilitated')
    expect(out[0].text).toContain('scour')
  })

  it('splits an oversized paragraph into multiple chunks', () => {
    const long = 'This is a sentence. '.repeat(120) // ~2400 chars
    const out = chunkBlocks([b('paragraph', long)])
    expect(out.length).toBeGreaterThan(1)
    expect(out.every((c) => c.text.length <= 1000)).toBe(true)
  })

  it('merges a tiny trailing paragraph into the previous chunk under the same heading', () => {
    const out = chunkBlocks([b('heading', 'TEAM'), b('paragraph', 'A'.repeat(300)), b('paragraph', 'PE 12345')])
    expect(out).toHaveLength(1)
    expect(out[0].text).toContain('PE 12345')
  })

  it('drops empty blocks and assigns sequential ordinals', () => {
    const out = chunkBlocks([b('paragraph', 'one'.repeat(300)), b('paragraph', '   '), b('heading', 'X'), b('paragraph', 'two'.repeat(300))])
    expect(out.map((c) => c.ordinal)).toEqual([0, 1])
  })
})
