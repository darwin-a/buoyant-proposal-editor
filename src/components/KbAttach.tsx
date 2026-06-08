'use client'

import { useEffect, useState } from 'react'

export interface KbOption {
  id: string
  title: string
  projectType: string | null
}
interface Suggestion {
  id: string
  title: string
  why: string
}

// Shorten the long "Statement of Qualifications — City of X" titles to just a label.
const label = (d: KbOption) => d.title.replace(/^Statement of Qualifications\s*[—-]\s*/i, '') + (d.projectType ? ` · ${d.projectType}` : '')

export function KbAttach({ proposalId, kbDocs, initialAttached }: { proposalId: string; kbDocs: KbOption[]; initialAttached: string[] }) {
  const [attached, setAttached] = useState<string[]>(initialAttached)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  useEffect(() => {
    let live = true
    fetch(`/api/proposals/${proposalId}/kb-suggestions`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => live && setSuggestions(d.suggestions ?? []))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [proposalId])

  async function persist(next: string[]) {
    setAttached(next)
    setSuggestions((s) => s.filter((x) => !next.includes(x.id)))
    await fetch(`/api/proposals/${proposalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachedKbIds: next }),
    })
  }
  const toggle = (id: string) => persist(attached.includes(id) ? attached.filter((x) => x !== id) : [...attached, id])

  return (
    <div>
      <p className="mb-2 text-[11px] leading-relaxed text-mute">
        Attach past proposals to ground “add / expand” edits in real work and scope retrieval.
      </p>

      {suggestions.length > 0 && (
        <div className="mb-2 space-y-1">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              title={s.why}
              className="block w-full rounded-lg border border-periwinkle/40 bg-periwinkle-soft px-2.5 py-1.5 text-left text-[11px] text-navy hover:border-periwinkle"
            >
              <span className="font-medium">Suggested:</span> + {label({ id: s.id, title: s.title, projectType: null })}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-1.5">
        {kbDocs.map((d) => {
          const on = attached.includes(d.id)
          return (
            <li key={d.id}>
              <button
                onClick={() => toggle(d.id)}
                title={d.title}
                className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                  on ? 'border-periwinkle bg-periwinkle-soft font-medium text-navy' : 'border-line bg-card text-ink hover:border-periwinkle'
                }`}
              >
                <span className="truncate">{label(d)}</span>
                <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide">{on ? '✓' : '+'}</span>
              </button>
            </li>
          )
        })}
        {kbDocs.length === 0 && <li className="text-xs text-mute">No KB documents.</li>}
      </ul>
    </div>
  )
}
