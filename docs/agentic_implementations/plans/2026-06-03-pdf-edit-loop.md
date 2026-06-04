# AI PDF Proposal Edit Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed Next.js app where a user uploads `easy.pdf`, selects a paragraph, asks AI to edit it, sees a diff, and applies it — with edits composing and undo.

**Architecture:** Parse the PDF server-side into a `DocumentModel` (sections/paragraphs with stable ids), cache by file hash, render it as clean editable blocks client-side. AI edits sit behind an `EditService` interface — a deterministic `MockEditService` ships now, a proxy-backed one drops in later. The document model + undo history live in client state.

**Tech Stack:** Next.js (App Router) + TypeScript · Tailwind · `pdfjs-dist` (extraction) · `diff` (word-level diff) · `vitest` (unit tests) · deploy on Vercel.

**Conventions:** `pnpm` for scripts (swap to `npm` if preferred — keep one). Library logic in `src/lib/**` is pure and unit-tested. Routes are thin. Commit after every task with un-squashed history (the brief grades how the work evolved).

---

### Task 0: Scaffold project + git

**Files:**
- Create: whole Next.js app at repo root
- Create: `.gitignore` (must ignore `.env*` and `.cache/`)

- [ ] **Step 1: Init git and Next.js app**

Run from `/Users/darwinagunos/buoyant_ai`:
```bash
git init
npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-import-alias --use-pnpm
```
Accept overwrite prompts; keep existing `README.md`, `CLAUDE.md`, and `docs/`.

- [ ] **Step 2: Add deps**

```bash
pnpm add pdfjs-dist diff
pnpm add -D vitest @types/diff
```

- [ ] **Step 3: Ensure secrets/cache are ignored**

Append to `.gitignore`:
```
.env
.env.local
.cache/
```

- [ ] **Step 4: Add vitest config + test script**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
```
Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 5: Verify dev server boots**

Run: `pnpm dev` then open http://localhost:3000 — expect the Next.js starter. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + TS + Tailwind, add deps and vitest"
```

---

### Task 1: Domain types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Define the model**

```ts
// src/lib/types.ts
export type BlockType = 'heading' | 'paragraph' | 'list'

export interface Block {
  id: string
  type: BlockType
  text: string
  level?: number // heading level 1..3
}

export interface DocumentModel {
  id: string
  title: string
  blocks: Block[]
}

export interface EditOp {
  id: string
  blockId: string
  before: string
  after: string
  instruction: string
  appliedAt: number
}

export interface EditRequest {
  blockText: string
  instruction: string
}

export interface EditResponse {
  proposedText: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts && git commit -m "feat: add DocumentModel/Block/EditOp types"
```

---

### Task 2: Heuristic segmentation (pure, TDD)

Turns positioned text lines into typed blocks. Pure function so it's testable without a PDF.

**Files:**
- Create: `src/lib/segment.ts`
- Test: `src/lib/segment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/segment.test.ts
import { describe, it, expect } from 'vitest'
import { segmentLines, type Line } from './segment'

const L = (text: string, y: number, height: number): Line => ({ text, y, height })

describe('segmentLines', () => {
  it('marks a large-font short line as a heading', () => {
    const lines = [L('PROJECT EXPERIENCE', 100, 16), L('We delivered the bridge on time.', 80, 10)]
    const blocks = segmentLines(lines, 'doc1')
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'PROJECT EXPERIENCE' })
    expect(blocks[1]).toMatchObject({ type: 'paragraph' })
  })

  it('joins consecutive body lines into one paragraph', () => {
    const lines = [L('We are a civil', 100, 10), L('engineering firm.', 88, 10)]
    const blocks = segmentLines(lines, 'doc1')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('We are a civil engineering firm.')
  })

  it('splits paragraphs across a large vertical gap', () => {
    const lines = [L('First paragraph.', 200, 10), L('Second paragraph.', 150, 10)]
    const blocks = segmentLines(lines, 'doc1')
    expect(blocks).toHaveLength(2)
  })

  it('assigns unique stable ids', () => {
    const lines = [L('A heading', 100, 16), L('Body text here.', 80, 10)]
    const ids = segmentLines(lines, 'doc1').map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/segment.test.ts`
Expected: FAIL — `segmentLines` not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/segment.ts
import type { Block } from './types'

export interface Line {
  text: string
  y: number // higher = further up the page (PDF coords)
  height: number // font height of the line
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/**
 * Group positioned lines (already ordered top→bottom) into typed blocks.
 * Heuristics tuned for single-column SOQs (easy.pdf):
 *  - heading: font height clearly above body median AND short line
 *  - paragraph break: vertical gap notably larger than the local line gap
 */
export function segmentLines(lines: Line[], docId: string): Block[] {
  if (lines.length === 0) return []
  const bodyHeight = median(lines.map((l) => l.height))
  const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y))
  const normalGap = median(gaps.filter((g) => g > 0)) || bodyHeight * 1.2

  const blocks: Block[] = []
  let buf: string[] = []
  let n = 0
  const flush = () => {
    if (!buf.length) return
    blocks.push({ id: `${docId}-b${n++}`, type: 'paragraph', text: buf.join(' ').replace(/\s+/g, ' ').trim() })
    buf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isHeading = line.height >= bodyHeight * 1.15 && line.text.trim().length <= 80
    const gapBefore = i > 0 ? Math.abs(lines[i - 1].y - line.y) : 0
    if (i > 0 && gapBefore > normalGap * 1.6) flush()
    if (isHeading) {
      flush()
      const level = line.height >= bodyHeight * 1.6 ? 1 : line.height >= bodyHeight * 1.3 ? 2 : 3
      blocks.push({ id: `${docId}-b${n++}`, type: 'heading', text: line.text.trim(), level })
    } else {
      buf.push(line.text)
    }
  }
  flush()
  return blocks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/segment.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/segment.ts src/lib/segment.test.ts && git commit -m "feat: heuristic line→block segmentation with tests"
```

---

### Task 3: PDF extraction (pdfjs → Lines)

Pulls positioned text from a PDF buffer and adapts it to `Line[]` for segmentation. Thin wrapper around pdfjs; not unit-tested (needs a real PDF) — verified via the parse route on `easy.pdf`.

**Files:**
- Create: `src/lib/extract.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/extract.ts
import type { Line } from './segment'

// Use the legacy build — runs under Node without a browser worker.
async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // @ts-expect-error - disable worker in Node
  pdfjs.GlobalWorkerOptions.workerSrc = undefined
  return pdfjs
}

/** Extract lines from all pages, grouping text items by their y position. */
export async function extractLines(data: Uint8Array): Promise<Line[]> {
  const pdfjs = await getPdfjs()
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise
  const out: Line[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const pageOffset = p * 100000 // keep page order monotonic in a single y-axis

    // Bucket items into lines by rounded y.
    const byY = new Map<number, { text: string[]; height: number; y: number }>()
    for (const item of content.items as any[]) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const height = Math.abs(item.transform[3]) || Math.abs(item.height) || 10
      const key = y
      const bucket = byY.get(key) ?? { text: [], height, y, }
      bucket.text.push(item.str)
      bucket.height = Math.max(bucket.height, height)
      byY.set(key, bucket)
    }

    const lines = [...byY.values()]
      .sort((a, b) => b.y - a.y) // top → bottom
      .map((l) => ({ text: l.text.join(' ').replace(/\s+/g, ' ').trim(), height: l.height, y: pageOffset - (page.view[3] - l.y) }))
      .filter((l) => l.text.length > 0)
    out.push(...lines)
  }
  return out
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/extract.ts && git commit -m "feat: pdfjs text+geometry extraction to Lines"
```

---

### Task 4: Parse cache + document builder

Ties extract + segment together, caches the `DocumentModel` to disk by file hash + model version.

**Files:**
- Create: `src/lib/parse.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/parse.ts
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentModel } from './types'
import { extractLines } from './extract'
import { segmentLines } from './segment'

const MODEL_VERSION = 'v1' // bump to invalidate cache when schema/heuristics change
const CACHE_DIR = join(process.cwd(), '.cache', 'parse')

export async function parsePdf(buf: Uint8Array, filename: string): Promise<DocumentModel> {
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  const cachePath = join(CACHE_DIR, `${hash}-${MODEL_VERSION}.json`)

  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as DocumentModel
  } catch {
    /* cache miss */
  }

  const lines = await extractLines(buf)
  const docId = hash
  const blocks = segmentLines(lines, docId)
  const firstHeading = blocks.find((b) => b.type === 'heading')?.text
  const doc: DocumentModel = {
    id: docId,
    title: firstHeading ?? filename.replace(/\.pdf$/i, ''),
    blocks: blocks.length ? blocks : [{ id: `${docId}-b0`, type: 'paragraph', text: '(No extractable text found.)' }],
  }

  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(cachePath, JSON.stringify(doc), 'utf8')
  return doc
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/parse.ts && git commit -m "feat: parse pipeline with disk cache by file hash"
```

---

### Task 5: EditService + MockEditService (pure, TDD)

**Files:**
- Create: `src/lib/edit-service.ts`
- Test: `src/lib/edit-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/edit-service.test.ts
import { describe, it, expect } from 'vitest'
import { MockEditService } from './edit-service'

const svc = new MockEditService()

describe('MockEditService', () => {
  it('replaces a name on a "X to Y" instruction', async () => {
    const { proposedText } = await svc.proposeEdit({
      blockText: 'We served the City of Monroe with distinction.',
      instruction: 'change Monroe to Macon',
    })
    expect(proposedText).toBe('We served the City of Macon with distinction.')
  })

  it('tightens by removing filler words', async () => {
    const { proposedText } = await svc.proposeEdit({
      blockText: 'We are really very committed to quite robust outcomes.',
      instruction: 'tighten this',
    })
    expect(proposedText).not.toMatch(/\b(really|very|quite)\b/)
  })

  it('returns a non-empty, changed string for generic instructions', async () => {
    const input = { blockText: 'our team   delivers.', instruction: 'make it cleaner' }
    const { proposedText } = await svc.proposeEdit(input)
    expect(proposedText.length).toBeGreaterThan(0)
    expect(proposedText).toBe('Our team delivers.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/edit-service.test.ts`
Expected: FAIL — `MockEditService` not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/edit-service.ts
import type { EditRequest, EditResponse } from './types'

export interface EditService {
  proposeEdit(req: EditRequest): Promise<EditResponse>
}

const FILLER = /\b(really|very|quite|just|actually|basically|in order to|that)\b/gi

/** Deterministic, token-free edits so the loop is fully demoable before the proxy token lands. */
export class MockEditService implements EditService {
  async proposeEdit({ blockText, instruction }: EditRequest): Promise<EditResponse> {
    const instr = instruction.trim()

    // "change X to Y" / "X should be Y" / "replace X with Y"
    const rep =
      instr.match(/(?:change|replace|fix)\s+["']?(.+?)["']?\s+(?:to|with|->|→)\s+["']?(.+?)["']?$/i) ||
      instr.match(/["']?(.+?)["']?\s+should be\s+["']?(.+?)["']?$/i)
    if (rep) {
      const [, from, to] = rep
      return { proposedText: blockText.split(from).join(to) }
    }

    if (/tighten|shorten|concise|trim|cut/i.test(instr)) {
      const tightened = blockText
        .replace(FILLER, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;])/g, '$1')
        .trim()
      return { proposedText: capitalize(tightened) }
    }

    // Generic: normalize whitespace + capitalize. Minor but visible, deterministic.
    return { proposedText: capitalize(blockText.replace(/\s+/g, ' ').trim()) }
  }
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/edit-service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/edit-service.ts src/lib/edit-service.test.ts && git commit -m "feat: EditService interface + deterministic MockEditService"
```

---

### Task 6: API routes (parse + edit)

**Files:**
- Create: `src/app/api/parse/route.ts`
- Create: `src/app/api/edit/route.ts`

- [ ] **Step 1: Implement parse route**

```ts
// src/app/api/parse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parsePdf } from '@/lib/parse'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const buf = new Uint8Array(await file.arrayBuffer())
  try {
    const doc = await parsePdf(buf, file.name)
    return NextResponse.json(doc)
  } catch (err) {
    console.error('parse failed', err)
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 })
  }
}
```

Note: `create-next-app --no-import-alias` may omit the `@/` alias. If `@/lib/...` fails to resolve, set `"paths": { "@/*": ["./src/*"] }` under `compilerOptions` in `tsconfig.json`, or use relative imports.

- [ ] **Step 2: Implement edit route**

```ts
// src/app/api/edit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { MockEditService } from '@/lib/edit-service'

export const runtime = 'nodejs'

const service = new MockEditService() // swap for ProxyEditService when the token lands

export async function POST(req: NextRequest) {
  const { blockText, instruction } = await req.json()
  if (typeof blockText !== 'string' || typeof instruction !== 'string' || !instruction.trim()) {
    return NextResponse.json({ error: 'blockText and instruction are required' }, { status: 400 })
  }
  const result = await service.proposeEdit({ blockText, instruction })
  return NextResponse.json(result)
}
```

- [ ] **Step 3: Verify parse end-to-end on easy.pdf**

```bash
pnpm dev
curl -s -X POST http://localhost:3000/api/parse \
  -F "file=@docs/ExampleProposals/proposals/easy.pdf" | head -c 600
```
Expected: JSON with `title` and a `blocks` array of headings/paragraphs. Confirm it isn't one giant block.

- [ ] **Step 4: Verify edit route**

```bash
curl -s -X POST http://localhost:3000/api/edit \
  -H 'Content-Type: application/json' \
  -d '{"blockText":"We served the City of Monroe.","instruction":"change Monroe to Macon"}'
```
Expected: `{"proposedText":"We served the City of Macon."}`. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/api && git commit -m "feat: /api/parse and /api/edit routes"
```

---

### Task 7: Undo/compose reducer (pure, TDD)

The document-editing state machine, isolated from React so it's unit-testable.

**Files:**
- Create: `src/lib/doc-reducer.ts`
- Test: `src/lib/doc-reducer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/doc-reducer.test.ts
import { describe, it, expect } from 'vitest'
import { docReducer, initDocState } from './doc-reducer'
import type { DocumentModel } from './types'

const doc: DocumentModel = {
  id: 'd', title: 'T',
  blocks: [
    { id: 'b0', type: 'paragraph', text: 'Alpha.' },
    { id: 'b1', type: 'paragraph', text: 'Beta.' },
  ],
}

describe('docReducer', () => {
  it('applies an edit to one block and records history', () => {
    let s = initDocState(doc)
    s = docReducer(s, { type: 'apply', blockId: 'b0', after: 'Gamma.', instruction: 'rewrite' })
    expect(s.doc.blocks[0].text).toBe('Gamma.')
    expect(s.doc.blocks[1].text).toBe('Beta.') // composes without touching others
    expect(s.history).toHaveLength(1)
  })

  it('undo restores the previous text and pops history', () => {
    let s = initDocState(doc)
    s = docReducer(s, { type: 'apply', blockId: 'b0', after: 'Gamma.', instruction: 'rewrite' })
    s = docReducer(s, { type: 'undo' })
    expect(s.doc.blocks[0].text).toBe('Alpha.')
    expect(s.history).toHaveLength(0)
  })

  it('undo is a no-op with empty history', () => {
    const s = initDocState(doc)
    expect(docReducer(s, { type: 'undo' })).toEqual(s)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/doc-reducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/doc-reducer.ts
import type { DocumentModel, EditOp } from './types'

export interface DocState {
  doc: DocumentModel
  history: EditOp[]
}

export type DocAction =
  | { type: 'apply'; blockId: string; after: string; instruction: string }
  | { type: 'undo' }

export function initDocState(doc: DocumentModel): DocState {
  return { doc, history: [] }
}

let counter = 0

export function docReducer(state: DocState, action: DocAction): DocState {
  switch (action.type) {
    case 'apply': {
      const block = state.doc.blocks.find((b) => b.id === action.blockId)
      if (!block || block.text === action.after) return state
      const op: EditOp = {
        id: `op-${counter++}`,
        blockId: action.blockId,
        before: block.text,
        after: action.after,
        instruction: action.instruction,
        appliedAt: 0, // stamped in the client to keep this reducer pure/deterministic
      }
      return {
        doc: {
          ...state.doc,
          blocks: state.doc.blocks.map((b) => (b.id === action.blockId ? { ...b, text: action.after } : b)),
        },
        history: [...state.history, op],
      }
    }
    case 'undo': {
      if (state.history.length === 0) return state
      const op = state.history[state.history.length - 1]
      return {
        doc: {
          ...state.doc,
          blocks: state.doc.blocks.map((b) => (b.id === op.blockId ? { ...b, text: op.before } : b)),
        },
        history: state.history.slice(0, -1),
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/doc-reducer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/doc-reducer.ts src/lib/doc-reducer.test.ts && git commit -m "feat: pure doc reducer for apply/compose/undo"
```

---

### Task 8: Word-level diff component

**Files:**
- Create: `src/components/DiffView.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/DiffView.tsx
'use client'
import { diffWords } from 'diff'

export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after)
  return (
    <p className="leading-relaxed">
      {parts.map((part, i) => {
        if (part.added) return <span key={i} className="bg-green-100 text-green-900 rounded px-0.5">{part.value}</span>
        if (part.removed) return <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">{part.value}</span>
        return <span key={i}>{part.value}</span>
      })}
    </p>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DiffView.tsx && git commit -m "feat: word-level DiffView"
```

---

### Task 9: Editable block component (inline edit loop)

One paragraph/heading: idle → selected (instruction input) → proposing → diff (Apply/Reject).

**Files:**
- Create: `src/components/EditableBlock.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/EditableBlock.tsx
'use client'
import { useState } from 'react'
import type { Block } from '@/lib/types'
import { DiffView } from './DiffView'

type Mode = 'idle' | 'editing' | 'proposing' | 'diff'

export function EditableBlock({
  block,
  onApply,
}: {
  block: Block
  onApply: (after: string, instruction: string) => void
}) {
  const [mode, setMode] = useState<Mode>('idle')
  const [instruction, setInstruction] = useState('')
  const [proposed, setProposed] = useState('')

  const Tag = block.type === 'heading' ? (`h${block.level ?? 2}` as 'h2') : 'p'
  const base = block.type === 'heading' ? 'font-semibold text-xl mt-6' : 'mt-3 text-[15px] leading-relaxed'

  async function propose() {
    if (!instruction.trim()) return
    setMode('proposing')
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockText: block.text, instruction }),
    })
    const data = await res.json()
    setProposed(data.proposedText ?? block.text)
    setMode('diff')
  }

  if (mode === 'idle') {
    return (
      <Tag
        className={`${base} cursor-pointer rounded px-2 -mx-2 transition hover:bg-amber-50`}
        onClick={() => setMode('editing')}
        title="Click to edit with AI"
      >
        {block.text}
      </Tag>
    )
  }

  return (
    <div className="my-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      {mode === 'diff' ? (
        <DiffView before={block.text} after={proposed} />
      ) : (
        <Tag className={base}>{block.text}</Tag>
      )}

      {mode === 'editing' && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && propose()}
            placeholder='e.g. "tighten this" or "change Monroe to Macon"'
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button onClick={propose} className="rounded bg-gray-900 px-3 py-1 text-sm text-white">Propose</button>
          <button onClick={() => setMode('idle')} className="px-2 text-sm text-gray-500">Cancel</button>
        </div>
      )}

      {mode === 'proposing' && <p className="mt-2 text-sm text-gray-500">Proposing…</p>}

      {mode === 'diff' && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => { onApply(proposed, instruction); setMode('idle'); setInstruction('') }}
            className="rounded bg-green-700 px-3 py-1 text-sm text-white"
          >Apply</button>
          <button onClick={() => setMode('idle')} className="px-2 text-sm text-gray-500">Reject</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/EditableBlock.tsx && git commit -m "feat: inline EditableBlock with propose/diff/apply"
```

---

### Task 10: Upload + document page (wires the loop)

**Files:**
- Create: `src/components/ProposalEditor.tsx`
- Modify: `src/app/page.tsx` (replace starter content)

- [ ] **Step 1: Implement the editor shell**

```tsx
// src/components/ProposalEditor.tsx
'use client'
import { useReducer, useState } from 'react'
import type { DocumentModel } from '@/lib/types'
import { docReducer, initDocState, type DocState, type DocAction } from '@/lib/doc-reducer'
import { EditableBlock } from './EditableBlock'

export function ProposalEditor() {
  const [doc, setDoc] = useState<DocumentModel | null>(null)
  const [loading, setLoading] = useState(false)

  if (!doc) return <Uploader loading={loading} setLoading={setLoading} onParsed={setDoc} />
  return <Editor doc={doc} onReset={() => setDoc(null)} />
}

function Uploader({
  loading, setLoading, onParsed,
}: { loading: boolean; setLoading: (b: boolean) => void; onParsed: (d: DocumentModel) => void }) {
  async function upload(file: File) {
    setLoading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/parse', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)
    if (res.ok) onParsed(data)
    else alert(data.error ?? 'Parse failed')
  }
  return (
    <div className="mx-auto mt-32 max-w-md text-center">
      <h1 className="text-2xl font-semibold">Edit a proposal</h1>
      <p className="mt-2 text-gray-500">Upload a proposal PDF to start editing it with AI.</p>
      <label className="mt-6 block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-10 hover:border-amber-400">
        <input type="file" accept="application/pdf" className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {loading ? 'Parsing…' : 'Drop a PDF or click to choose'}
      </label>
    </div>
  )
}

function Editor({ doc, onReset }: { doc: DocumentModel; onReset: () => void }) {
  const [state, dispatch] = useReducer<(s: DocState, a: DocAction) => DocState>(docReducer, initDocState(doc))
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between border-b pb-3">
        <h1 className="text-xl font-semibold">{state.doc.title}</h1>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => dispatch({ type: 'undo' })}
            disabled={state.history.length === 0}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >Undo{state.history.length ? ` (${state.history.length})` : ''}</button>
          <button onClick={onReset} className="rounded border px-3 py-1">New document</button>
        </div>
      </header>
      <article>
        {state.doc.blocks.map((b) => (
          <EditableBlock
            key={b.id}
            block={b}
            onApply={(after, instruction) => dispatch({ type: 'apply', blockId: b.id, after, instruction })}
          />
        ))}
      </article>
    </div>
  )
}
```

- [ ] **Step 2: Replace the home page**

```tsx
// src/app/page.tsx
import { ProposalEditor } from '@/components/ProposalEditor'

export default function Home() {
  return <main className="min-h-screen bg-white text-gray-900">{<ProposalEditor />}</main>
}
```

- [ ] **Step 3: Manual end-to-end check (the bar)**

```bash
pnpm dev
```
In the browser at http://localhost:3000:
1. Upload `docs/ExampleProposals/proposals/easy.pdf` → document renders as blocks.
2. Click a paragraph → type `tighten this` → Propose → diff shows → Apply → text updates.
3. Edit a second paragraph (`change <a name in it> to Smith`) → Apply → composes.
4. Click Undo → last change reverts.
Stop the dev server.

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm test`
Expected: PASS — segment (4), edit-service (3), doc-reducer (3).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/ProposalEditor.tsx && git commit -m "feat: upload + inline edit loop wired end-to-end"
```

---

### Task 11: Build check + deploy

**Files:**
- Modify: `README.md` (replace stub with run instructions — full graded sections come later)

- [ ] **Step 1: Production build passes**

Run: `pnpm build`
Expected: build completes with no type errors. Fix any `@/` alias or type issues surfaced here.

- [ ] **Step 2: Minimal run instructions in README**

Replace `README.md` contents with at least: project name, `pnpm install`, `pnpm dev`, and the note that AI runs via `MockEditService` until `BUOYANT_PROXY_TOKEN` is set. (Full graded README sections — design decisions, cuts, failure modes, evaluation — are a later task.)

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --prod
```
Follow prompts (link/create project). Confirm the deployed URL loads and the loop closes on `easy.pdf`.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: run instructions; deploy to Vercel"
```

---

## Out of scope (deliberately deferred)

`ProxyEditService` (drop in when token arrives) · KB grounding · multi-paragraph chat · PDF export · hard.pdf · persistence/DB · the full graded README sections (design decisions, cuts, failure modes, evaluation-with-numbers). Each is a follow-up once the loop is closed and deployed.

## Self-review notes

- **Spec coverage:** representation (Task 2–4, 9–10), hybrid parse baseline (Task 3–4; LLM cleanup deferred with the proxy), AI seam (Task 5–6), inline paragraph UX (Task 9–10), compose+undo (Task 7, 10), no-DB disk cache (Task 4), deploy (Task 11). The LLM cleanup pass and `ProxyEditService` from the spec are intentionally deferred (token not yet available) — noted in Out of scope.
- **Type consistency:** `EditRequest`/`EditResponse` (Task 1) used by `EditService` (Task 5) and `/api/edit` (Task 6); `DocAction`/`DocState` (Task 7) used by `ProposalEditor` (Task 10); `Block`/`DocumentModel` consistent throughout.
- **Placeholders:** none — every code step is complete.
