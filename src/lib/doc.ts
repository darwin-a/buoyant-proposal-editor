// Document model + validation. NO pdfjs import — so server routes that only persist or
// validate an already-parsed document never drag the browser-only pdfjs into the Node
// runtime (pdfjs references DOMMatrix, which crashes Vercel's serverless functions).

export type BlockType = 'heading' | 'paragraph'
export interface Block {
  id: string
  type: BlockType
  text: string
  level?: number
}
export interface LockedField {
  label: string
  value: string
}
export interface ParsedDoc {
  title: string
  blocks: Block[]
  lockedFields: LockedField[]
}

const MAX_BLOCKS = 5000
const MAX_TEXT = 20_000

// Validate untrusted JSON (parsed in the browser) into a ParsedDoc, or null if unusable.
export function validateParsedDoc(input: unknown): ParsedDoc | null {
  if (typeof input !== 'object' || input === null) return null
  const o = input as Record<string, unknown>
  if (!Array.isArray(o.blocks)) return null

  const blocks: Block[] = []
  for (const b of o.blocks.slice(0, MAX_BLOCKS)) {
    if (typeof b !== 'object' || b === null) continue
    const r = b as Record<string, unknown>
    if ((r.type !== 'heading' && r.type !== 'paragraph') || typeof r.text !== 'string' || !r.text.trim()) continue
    blocks.push({
      id: typeof r.id === 'string' && r.id ? r.id : `b-${blocks.length}`,
      type: r.type,
      text: r.text.slice(0, MAX_TEXT),
      ...(typeof r.level === 'number' ? { level: r.level } : {}),
    })
  }
  if (blocks.length === 0) return null

  const lockedFields: LockedField[] = Array.isArray(o.lockedFields)
    ? o.lockedFields.flatMap((f) => {
        if (typeof f !== 'object' || f === null) return []
        const r = f as Record<string, unknown>
        return typeof r.label === 'string' && typeof r.value === 'string' ? [{ label: r.label, value: r.value }] : []
      })
    : []

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.slice(0, 300) : 'Untitled proposal'
  return { title, blocks, lockedFields }
}
