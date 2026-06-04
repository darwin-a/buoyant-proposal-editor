'use client'

import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import { blocksToDoc, docToBlocks, type PMDoc } from '@/lib/tiptap'
import type { Block } from '@/lib/parse'

// Carry our block id as a node attribute (data-block-id) so edits stay addressable.
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

export function Editor({ proposalId, blocks }: { proposalId: string; blocks: Block[] }) {
  const [status, setStatus] = useState<Status>('saved')

  const editor = useEditor({
    extensions: [StarterKit, BlockId],
    content: blocksToDoc(blocks),
    immediatelyRender: false, // avoid SSR hydration mismatch
    editorProps: { attributes: { class: 'doc-editor' } },
    onUpdate: () => setStatus((s) => (s === 'saving' ? s : 'dirty')),
  })

  async function save() {
    if (!editor || status !== 'dirty') return
    setStatus('saving')
    const document = docToBlocks(editor.getJSON() as PMDoc)
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document }),
    })
    setStatus(res.ok ? 'saved' : 'dirty')
  }

  const label = status === 'saved' ? 'All changes saved' : status === 'saving' ? 'Saving…' : 'Unsaved changes'

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={status !== 'dirty'}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-30"
        >
          Save
        </button>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
