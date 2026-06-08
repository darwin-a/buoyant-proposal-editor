import type { Block } from './parse'

export interface Chunk {
  heading: string | null
  text: string
  ordinal: number
}

const TARGET = 800 // soft max chars per chunk
const MIN = 200 // merge a chunk smaller than this into the previous (same heading)

// Group consecutive paragraph blocks under their nearest preceding heading into
// ~TARGET-char chunks. Headings reset the running buffer and become the chunk label.
export function chunkBlocks(blocks: Block[]): Chunk[] {
  const chunks: Chunk[] = []
  let heading: string | null = null
  let buf = ''

  const flush = () => {
    const text = buf.trim()
    if (text) chunks.push({ heading, text, ordinal: chunks.length })
    buf = ''
  }

  for (const block of blocks) {
    if (block.type === 'heading') {
      flush()
      heading = block.text.trim() || heading
      continue
    }
    const para = block.text.trim()
    if (!para) continue
    if (para.length > TARGET) {
      flush()
      for (const piece of splitLong(para, TARGET)) chunks.push({ heading, text: piece, ordinal: chunks.length })
      continue
    }
    if (buf && buf.length + para.length + 1 > TARGET) flush()
    buf = buf ? `${buf} ${para}` : para
  }
  flush()
  return mergeTiny(chunks)
}

function splitLong(text: string, target: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text]
  const out: string[] = []
  let buf = ''
  for (const s of sentences) {
    if (buf && buf.length + s.length > target) {
      out.push(buf.trim())
      buf = ''
    }
    buf += s
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function mergeTiny(chunks: Chunk[]): Chunk[] {
  const out: Chunk[] = []
  for (const c of chunks) {
    const prev = out[out.length - 1]
    if (prev && c.text.length < MIN && prev.heading === c.heading) {
      prev.text = `${prev.text} ${c.text}`
    } else {
      out.push({ heading: c.heading, text: c.text, ordinal: out.length })
    }
  }
  return out
}
