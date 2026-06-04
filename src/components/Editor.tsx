'use client'

import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import { blocksToDoc, docToBlocks, type PMDoc } from '@/lib/tiptap'
import type { Block, LockedField } from '@/lib/parse'
import type { EditResponse } from '@/lib/edit-service'
import { findLockedViolations } from '@/lib/locked-fields'
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
type AiPhase = 'closed' | 'instructing' | 'proposing' | 'diff'

export function Editor({
  proposalId,
  blocks,
  lockedFields,
}: {
  proposalId: string
  blocks: Block[]
  lockedFields: LockedField[]
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
    onUpdate: () => setStatus((s) => (s === 'saving' ? s : 'dirty')),
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
    setProposed(await res.json())
    setPhase('diff')
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
      <div className="mb-8 flex items-center justify-between border-b border-gray-100 pb-3">
        <span className="text-xs text-gray-400">{label}</span>
        <button
          onClick={save}
          disabled={status !== 'dirty'}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-25"
        >
          Save
        </button>
      </div>

      <EditorContent editor={editor} />
      <p className="mt-6 text-xs text-gray-300">Tip: highlight any text to edit it with AI.</p>

      {/* floating ✨ trigger at the selection */}
      {phase === 'closed' && sel && (
        <div style={{ position: 'fixed', top: sel.top - 44, left: sel.left, zIndex: 30 }}>
          <button
            onMouseDown={(e) => e.preventDefault()} // keep the editor selection
            onClick={askAi}
            className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-gray-700"
          >
            ✨ Ask AI
          </button>
        </div>
      )}

      {/* floating instruction / diff card anchored at the selection */}
      {phase !== 'closed' && target && (
        <div
          style={{ position: 'fixed', top: clampTop(target.top + 24), left: clampLeft(target.left), zIndex: 30 }}
          className="w-[26rem] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
        >
          <div className="mb-2 text-[11px] text-gray-400">
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
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-gray-900"
              />
              <button onClick={propose} disabled={!instruction.trim()} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-30">
                Propose
              </button>
              <button onClick={close} className="px-1 text-sm text-gray-400">✕</button>
            </div>
          )}

          {phase === 'proposing' && <p className="py-1 text-sm text-gray-500">Proposing…</p>}

          {phase === 'diff' && proposed && (() => {
            const violations = findLockedViolations(target.text, proposed.proposedText, lockedFields, proposed.changedEntities)
            return (
              <div>
                <div className="max-h-[32vh] overflow-y-auto pr-1">
                  <DiffView before={target.text} after={proposed.proposedText} />
                  <p className="mt-2 text-[11px] text-gray-500">ⓘ {proposed.rationale}</p>
                </div>
                {violations.length > 0 && (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                    ⚠ This also changes a locked {violations.length === 1 ? 'fact' : 'facts'}:{' '}
                    <span className="font-medium">{violations.map((v) => v.value).join(', ')}</span>.
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={accept}
                    className={`rounded px-3 py-1.5 text-sm font-medium text-white ${violations.length ? 'bg-red-600 hover:bg-red-700' : 'bg-green-700'}`}
                  >
                    {violations.length ? 'Apply anyway' : 'Apply'}
                  </button>
                  <button onClick={close} className="px-2 text-sm text-gray-500">Reject</button>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
