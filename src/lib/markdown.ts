import type { Block } from './parse'

// Serialize the edited document (Block[]) to Markdown — headings by level, paragraphs as text.
export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      const text = b.text.trim()
      if (!text) return ''
      if (b.type === 'heading') {
        const hashes = '#'.repeat(Math.min(Math.max(b.level ?? 1, 1), 6))
        return `${hashes} ${text}`
      }
      return text
    })
    .filter(Boolean)
    .join('\n\n')
}

// A filesystem-safe filename derived from the first heading (or a fallback).
export function markdownFilename(blocks: Block[]): string {
  const first = blocks.find((b) => b.type === 'heading' && b.text.trim())?.text ?? 'proposal'
  const slug = first
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'proposal'}.md`
}
