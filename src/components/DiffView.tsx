'use client'

import { diffWords } from 'diff'

// Inline word-level diff: struck-out removals, highlighted additions.
export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after)
  return (
    <p className="text-[15px] leading-relaxed">
      {parts.map((part, i) => {
        if (part.added) return <span key={i} className="rounded bg-green-100 px-0.5 text-green-900">{part.value}</span>
        if (part.removed) return <span key={i} className="rounded bg-red-100 px-0.5 text-red-900 line-through">{part.value}</span>
        return <span key={i}>{part.value}</span>
      })}
    </p>
  )
}
