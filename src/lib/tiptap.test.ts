import { describe, it, expect } from 'vitest'
import { blocksToDoc, docToBlocks } from './tiptap'
import type { Block } from './parse'

const blocks: Block[] = [
  { id: 'b-0', type: 'heading', text: 'OUR FIRM', level: 2 },
  { id: 'b-1', type: 'paragraph', text: 'MECO is a firm.' },
]

describe('blocks ↔ tiptap doc', () => {
  it('converts blocks to a doc carrying blockId + level', () => {
    const doc = blocksToDoc(blocks)
    expect(doc.type).toBe('doc')
    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { blockId: 'b-0', level: 2 } })
    expect(doc.content[1]).toMatchObject({ type: 'paragraph', attrs: { blockId: 'b-1' } })
    expect(doc.content[0].content?.[0]).toEqual({ type: 'text', text: 'OUR FIRM' })
  })

  it('round-trips back to the same blocks', () => {
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks)
  })

  it('handles an empty paragraph (no content)', () => {
    const doc = blocksToDoc([{ id: 'b-0', type: 'paragraph', text: '' }])
    expect(doc.content[0].content).toBeUndefined()
    expect(docToBlocks(doc)).toEqual([{ id: 'b-0', type: 'paragraph', text: '' }])
  })

  it('falls back to a generated id when blockId is missing', () => {
    const blocks = docToBlocks({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] })
    expect(blocks).toEqual([{ id: 'b-0', type: 'paragraph', text: 'hi' }])
  })
})
