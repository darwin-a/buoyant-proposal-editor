import type { Block } from './parse'

// Plain JSON transforms between our Block[] model and a TipTap/ProseMirror doc.
// blockId is carried as a node attribute so edits/diffs/locks stay addressable.

type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: { type: string; text?: string }[]
}
export type PMDoc = { type: 'doc'; content: PMNode[] }

export function blocksToDoc(blocks: Block[]): PMDoc {
  const content = blocks.map((b) => {
    const node = {
      type: b.type === 'heading' ? 'heading' : 'paragraph',
      attrs: { blockId: b.id, ...(b.type === 'heading' ? { level: b.level ?? 2 } : {}) },
    } as PMDoc['content'][number]
    // omit content for empty text (matches editor.getJSON() output for an empty block)
    if (b.text) node.content = [{ type: 'text', text: b.text }]
    return node
  })
  return { type: 'doc', content }
}

export function docToBlocks(doc: PMDoc | null | undefined): Block[] {
  const out: Block[] = []
  let n = 0
  for (const node of doc?.content ?? []) {
    if (node.type !== 'heading' && node.type !== 'paragraph') continue
    const text = (node.content ?? []).map((c) => c.text ?? '').join('')
    const id = (node.attrs?.blockId as string) ?? `b-${n}`
    if (node.type === 'heading') {
      out.push({ id, type: 'heading', text, level: (node.attrs?.level as number) ?? 2 })
    } else {
      out.push({ id, type: 'paragraph', text })
    }
    n++
  }
  return out
}
