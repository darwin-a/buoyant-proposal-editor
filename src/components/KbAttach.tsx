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
    <div className="mt-6">
      <span className="text-xs font-semibold uppercase tracking-wide text-mute">Knowledge base</span>
      <p className="mt-1 mb-2 text-xs leading-relaxed text-mute">Attach past proposals to ground “add / expand” edits in real work.</p>

      {suggestions.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {suggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-periwinkle/40 bg-periwinkle-soft px-2.5 py-2 text-[11px] text-navy">
              <span className="font-medium">{s.title}</span> — {s.why}.
              <button onClick={() => toggle(s.id)} className="ml-2 font-semibold underline">
                Attach
              </button>
            </div>
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
                className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-sm transition ${
                  on ? 'border-periwinkle bg-periwinkle-soft text-navy' : 'border-line bg-card text-ink hover:border-periwinkle'
                }`}
              >
                <span className="truncate">{d.title}</span>
                <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide">{on ? '✓ attached' : 'attach'}</span>
              </button>
            </li>
          )
        })}
        {kbDocs.length === 0 && <li className="text-xs text-mute">No KB documents.</li>}
      </ul>
    </div>
  )
}
