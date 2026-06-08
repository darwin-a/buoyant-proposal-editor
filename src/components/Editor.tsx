'use client'

import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import { blocksToDoc, docToBlocks, type PMDoc } from '@/lib/tiptap'
import type { Block, LockedField } from '@/lib/parse'
import type { EditResponse } from '@/lib/edit-service'
import { analyzeLockedChange } from '@/lib/locked-fields'
import { DiffView } from './DiffView'

// Carry our block id as a node attribute so edits stay addressable.
const BlockId = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-block-id'),
            renderHTML: (attrs) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {}),
          },
        },
      },
    ]
  },
})

type Status = 'saved' | 'dirty' | 'saving'
type Selection = { from: number; to: number; text: string; blockId: string; top: number; left: number }
type AiPhase = 'closed' | 'instructing' | 'proposing' | 'diff' | 'clarify'

export function Editor({
  proposalId,
  blocks,
  lockedFields,
  onDocChange,
}: {
  proposalId: string
  blocks: Block[]
  lockedFields: LockedField[]
  onDocChange?: (text: string) => void
}) {
  const [status, setStatus] = useState<Status>('saved')
  const [sel, setSel] = useState<Selection | null>(null) // live selection → floating trigger
  const [target, setTarget] = useState<Selection | null>(null) // captured for the AI flow
  const [phase, setPhase] = useState<AiPhase>('closed')
  const [instruction, setInstruction] = useState('')
  const [proposed, setProposed] = useState<EditResponse | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, BlockId],
    content: blocksToDoc(blocks),
    immediatelyRender: false,
    editorProps: { attributes: { class: 'doc-editor' } },
    onUpdate: ({ editor }) => {
      setStatus((s) => (s === 'saving' ? s : 'dirty'))
      onDocChange?.(editor.getText())
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, $from } = editor.state.selection
      if (from === to) return setSel(null) // collapsed cursor → no menu
      const text = editor.state.doc.textBetween(from, to, ' ').trim()
      if (!text) return setSel(null)
      const blockId = ($from.depth >= 1 ? ($from.node(1).attrs.blockId as string) : '') ?? ''
      const coords = editor.view.coordsAtPos(from)
      setSel({ from, to, text, blockId, top: coords.top, left: coords.left })
    },
  })

  async function save() {
    if (!editor) return
    setStatus('saving')
    const document = docToBlocks(editor.getJSON() as PMDoc)
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document }),
    })
    setStatus(res.ok ? 'saved' : 'dirty')
  }

  function askAi() {
    if (!sel) return
    setTarget(sel)
    setInstruction('')
    setProposed(null)
    setPhase('instructing')
  }

  function close() {
    setPhase('closed')
    setTarget(null)
  }

  async function propose() {
    if (!target || !instruction.trim()) return
    setPhase('proposing')
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockText: target.text, instruction }),
    })
    const result: EditResponse = await res.json()
    setProposed(result)
    // A clarification means the model couldn't make a confident edit — show the question,
    // never a diff or an Apply button. Keep the typed instruction so it's easy to refine.
    setPhase(result.clarification ? 'clarify' : 'diff')
  }

  function accept() {
    if (!editor || !target || !proposed) return
    editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, proposed.proposedText).run()
    void save()
    void fetch(`/api/proposals/${proposalId}/edits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId: target.blockId,
        kind: 'ai',
        instruction,
        before: target.text,
        after: proposed.proposedText,
        rationale: proposed.rationale,
        changedEntities: proposed.changedEntities,
      }),
    })
    close()
  }

  const label = status === 'saved' ? 'All changes saved' : status === 'saving' ? 'Saving…' : 'Unsaved changes'
  const clampLeft = (x: number) => (typeof window !== 'undefined' ? Math.min(x, window.innerWidth - 430) : x)
  const clampTop = (y: number) => {
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    return Math.max(80, Math.min(y, h - 340)) // keep the whole card (incl. buttons) on screen
  }

  return (
    <div className="min-w-0">
      <div className="mb-8 flex items-center justify-between border-b border-line pb-3">
        <span className="text-xs text-mute">{label}</span>
        <button
          onClick={save}
          disabled={status !== 'dirty'}
          className="rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white transition hover:bg-navy-700 disabled:opacity-25"
        >
          Save
        </button>
      </div>

      <EditorContent editor={editor} />
      <p className="mt-6 text-xs text-mute/70">Tip: highlight any text to edit it with AI.</p>

      {/* floating ✨ trigger at the selection */}
      {phase === 'closed' && sel && (
        <div style={{ position: 'fixed', top: sel.top - 44, left: sel.left, zIndex: 30 }}>
          <button
            onMouseDown={(e) => e.preventDefault()} // keep the editor selection
            onClick={askAi}
            className="rounded-full bg-navy px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-navy-700"
          >
            ✨ Ask AI
          </button>
        </div>
      )}

      {/* floating instruction / diff card anchored at the selection */}
      {phase !== 'closed' && target && (
        <div
          style={{ position: 'fixed', top: clampTop(target.top + 24), left: clampLeft(target.left), zIndex: 30 }}
          className="animate-pop w-[26rem] rounded-xl border border-line bg-card p-3 shadow-2xl"
        >
          <div className="mb-2 text-[11px] text-mute">
            Editing “{target.text.slice(0, 70)}{target.text.length > 70 ? '…' : ''}”
          </div>

          {phase === 'instructing' && (
            <div className="flex gap-2">
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') propose()
                  if (e.key === 'Escape') close()
                }}
                placeholder="Tell the AI what to change…"
                className="flex-1 rounded border border-line px-2 py-1.5 text-sm outline-none transition focus:border-periwinkle"
              />
              <button onClick={propose} disabled={!instruction.trim()} className="rounded bg-navy px-3 py-1.5 text-sm text-white transition hover:bg-navy-700 disabled:opacity-30">
                Propose
              </button>
              <button onClick={close} className="px-1 text-sm text-mute">✕</button>
            </div>
          )}

          {phase === 'proposing' && <p className="py-1 text-sm text-mute">Proposing…</p>}

          {phase === 'clarify' && proposed?.clarification && (
            <div>
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[13px] text-amber-900">
                <span className="font-medium">The AI needs more direction.</span>
                <p className="mt-1">{proposed.clarification}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') propose()
                    if (e.key === 'Escape') close()
                  }}
                  placeholder="Be more specific…"
                  className="flex-1 rounded border border-line px-2 py-1.5 text-sm outline-none transition focus:border-periwinkle"
                />
                <button onClick={propose} disabled={!instruction.trim()} className="rounded bg-navy px-3 py-1.5 text-sm text-white transition hover:bg-navy-700 disabled:opacity-30">
                  Retry
                </button>
                <button onClick={close} className="px-1 text-sm text-mute">✕</button>
              </div>
            </div>
          )}

          {phase === 'diff' && proposed && (() => {
            const { collateral, intentional } = analyzeLockedChange(
              target.text,
              proposed.proposedText,
              lockedFields,
              proposed.changedEntities,
            )
            return (
              <div>
                <div className="max-h-[32vh] overflow-y-auto pr-1">
                  <DiffView before={target.text} after={proposed.proposedText} />
                  <p className="mt-2 text-[11px] text-mute">ⓘ {proposed.rationale}</p>
                </div>
                {collateral.length > 0 ? (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                    ⚠ This also changes a locked {collateral.length === 1 ? 'fact' : 'facts'} you didn’t ask about:{' '}
                    <span className="font-medium">{collateral.map((v) => v.value).join(', ')}</span>.
                  </div>
                ) : intentional.length > 0 ? (
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                    🔒 You’re changing a locked {intentional.length === 1 ? 'fact' : 'facts'}:{' '}
                    <span className="font-medium">{intentional.map((v) => v.value).join(', ')}</span>.
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={accept}
                    className={`rounded px-3 py-1.5 text-sm font-medium text-white ${collateral.length ? 'bg-red-600 hover:bg-red-700' : 'bg-green-700'}`}
                  >
                    {collateral.length ? 'Apply anyway' : 'Apply'}
                  </button>
                  <button onClick={close} className="px-2 text-sm text-mute">Reject</button>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
