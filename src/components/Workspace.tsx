'use client'

import { useState } from 'react'
import { Editor } from './Editor'
import { KbAttach, type KbOption } from './KbAttach'
import { RailSection } from './RailSection'
import type { Block, LockedField } from '@/lib/parse'

const occurrences = (text: string, v: string) => (v ? text.split(v).length - 1 : 0)

// Holds the editor + a LIVE locked-facts rail: if an edit alters/drops any occurrence
// of a locked value, it's flagged for review (count-based, since e.g. "Dixon" recurs).
export function Workspace({
  proposalId,
  blocks,
  lockedFields,
  kbDocs,
  attachedKbIds,
}: {
  proposalId: string
  blocks: Block[]
  lockedFields: LockedField[]
  kbDocs: KbOption[]
  attachedKbIds: string[]
}) {
  const original = blocks.map((b) => b.text).join('\n')
  const [docText, setDocText] = useState(original)

  const statuses = lockedFields.map((f) => ({
    ...f,
    changed: occurrences(docText, f.value) < occurrences(original, f.value),
  }))
  const changedCount = statuses.filter((s) => s.changed).length

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid grid-cols-[minmax(0,1fr)_18rem] gap-8">
        {/* document sheet */}
        <div className="rounded-2xl border border-line bg-card px-10 py-12 shadow-sm">
          {blocks.length === 0 ? (
            <p className="text-sm text-mute">No editable text found.</p>
          ) : (
            <Editor proposalId={proposalId} blocks={blocks} lockedFields={lockedFields} onDocChange={setDocText} />
          )}
        </div>

        {/* right rail — collapsible knowledge base + live locked facts */}
        <aside className="sticky top-24 flex flex-col gap-3 self-start">
          <RailSection title="Knowledge base" defaultOpen={attachedKbIds.length === 0}>
            <KbAttach proposalId={proposalId} kbDocs={kbDocs} initialAttached={attachedKbIds} />
          </RailSection>

          <RailSection
            title="Locked facts"
            badge={
              <>
                <span className="rounded-full bg-navy px-1.5 py-0.5 text-[10px] font-medium text-white">{lockedFields.length}</span>
                {changedCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">{changedCount} changed</span>
                )}
              </>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-mute">
              Detected automatically. A fact that an edit changes or drops is flagged here for review.
            </p>
            <ul className="space-y-1.5">
              {statuses.map((f, i) => (
                <li key={i} className={`rounded-lg border px-2.5 py-1.5 ${f.changed ? 'border-amber-300 bg-amber-50' : 'border-line bg-card'}`}>
                  <span className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-mute">{f.label}</span>
                    {f.changed && <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">changed</span>}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-ink">
                    <span className={f.changed ? 'text-amber-500' : 'text-periwinkle'}>{f.changed ? '⚠' : '🔒'}</span>
                    <span className={f.changed ? 'text-mute line-through' : ''}>{f.value}</span>
                  </span>
                </li>
              ))}
              {lockedFields.length === 0 && <li className="text-xs text-mute">None detected.</li>}
            </ul>
          </RailSection>
        </aside>
      </div>
    </div>
  )
}
