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
    <div className="mb-6 rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-mute">Knowledge base</span>
        {kbDocs.map((d) => {
          const on = attached.includes(d.id)
          return (
            <button
              key={d.id}
              onClick={() => toggle(d.id)}
              title={d.title}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                on ? 'border-periwinkle bg-periwinkle-soft font-medium text-navy' : 'border-line bg-card text-mute hover:border-periwinkle hover:text-ink'
              }`}
            >
              {on ? '✓ ' : '+ '}
              {label(d)}
            </button>
          )
        })}
        {kbDocs.length === 0 && <span className="text-xs text-mute">No KB documents.</span>}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-navy">
          <span className="text-mute">Suggested:</span>
          {suggestions.map((s) => (
            <button key={s.id} onClick={() => toggle(s.id)} className="rounded-full bg-periwinkle-soft px-2 py-0.5 font-medium hover:underline" title={s.why}>
              + {label({ id: s.id, title: s.title, projectType: null })}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-mute">
        Attached proposals ground “add / expand” edits in real past work — and scope retrieval so it pulls the right precedent.
      </p>
    </div>
  )
}
