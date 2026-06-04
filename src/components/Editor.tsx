'use client'

import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import { blocksToDoc, docToBlocks, type PMDoc } from '@/lib/tiptap'
import type { Block } from '@/lib/parse'
import type { EditResponse } from '@/lib/edit-service'
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
type ActiveBlock = { blockId: string; text: string }
type AiPhase = 'closed' | 'instructing' | 'proposing' | 'diff'

export function Editor({ proposalId, blocks }: { proposalId: string; blocks: Block[] }) {
  const [status, setStatus] = useState<Status>('saved')
  const [active, setActive] = useState<ActiveBlock | null>(null)
  const [aiTarget, setAiTarget] = useState<ActiveBlock | null>(null)
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
      const { $from } = editor.state.selection
      if ($from.depth < 1) return setActive(null)
      const node = $from.node(1)
      setActive({ blockId: (node.attrs.blockId as string) ?? '', text: node.textContent })
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

  function openAi() {
    if (!active?.text.trim()) return
    setAiTarget(active)
    setInstruction('')
    setProposed(null)
    setPhase('instructing')
  }

  async function propose() {
    if (!aiTarget || !instruction.trim()) return
    setPhase('proposing')
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockText: aiTarget.text, instruction }),
    })
    setProposed(await res.json())
    setPhase('diff')
  }

  function applyToBlock(blockId: string, newText: string) {
    if (!editor) return
    const { state, view } = editor
    let target: { pos: number; size: number } | null = null
    state.doc.descendants((node, pos) => {
      if (target) return false
      if (node.attrs?.blockId === blockId) target = { pos, size: node.nodeSize }
      return true
    })
    if (!target) return
    const { pos, size } = target
    view.dispatch(state.tr.insertText(newText, pos + 1, pos + size - 1))
  }

  async function accept() {
    if (!aiTarget || !proposed) return
    applyToBlock(aiTarget.blockId, proposed.proposedText)
    setPhase('closed')
    await save()
    // log the applied edit (edit history / review trail)
    void fetch(`/api/proposals/${proposalId}/edits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId: aiTarget.blockId,
        kind: 'ai',
        instruction,
        before: aiTarget.text,
        after: proposed.proposedText,
        rationale: proposed.rationale,
        changedEntities: proposed.changedEntities,
      }),
    })
  }

  const label = status === 'saved' ? 'All changes saved' : status === 'saving' ? 'Saving…' : 'Unsaved changes'

  return (
    <div className="min-w-0">
      <div className="mb-8 flex items-center justify-between border-b border-gray-100 pb-3">
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={openAi}
            disabled={!active?.text.trim()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400 disabled:opacity-30"
            title={active?.text.trim() ? 'Edit the current block with AI' : 'Click into a paragraph first'}
          >
            ✨ Ask AI
          </button>
          <button
            onClick={save}
            disabled={status !== 'dirty'}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-25"
          >
            Save
          </button>
        </div>
      </div>

      {phase !== 'closed' && aiTarget && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 text-xs text-gray-500">
            Editing: “{aiTarget.text.slice(0, 90)}{aiTarget.text.length > 90 ? '…' : ''}”
          </div>

          {phase === 'instructing' && (
            <div className="flex gap-2">
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && propose()}
                placeholder="Tell the AI what to change… (e.g. “tighten this”, “the client is Dixon”)"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-gray-900"
              />
              <button onClick={propose} disabled={!instruction.trim()} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-30">
                Propose
              </button>
              <button onClick={() => setPhase('closed')} className="px-2 text-sm text-gray-500">Cancel</button>
            </div>
          )}

          {phase === 'proposing' && <p className="text-sm text-gray-500">Proposing…</p>}

          {phase === 'diff' && proposed && (
            <div>
              <DiffView before={aiTarget.text} after={proposed.proposedText} />
              <p className="mt-2 text-xs text-gray-500">ⓘ {proposed.rationale}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={accept} className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white">Apply</button>
                <button onClick={() => setPhase('closed')} className="px-2 text-sm text-gray-500">Reject</button>
              </div>
            </div>
          )}
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  )
}
