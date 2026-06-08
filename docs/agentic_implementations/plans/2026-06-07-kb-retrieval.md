# KB Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground "add / expand" AI edits in the firm's past proposals — retrieve the relevant passage, inject it into the edit prompt, and cite the source — with proposal-level scoping and a deterministic suggestion-on-open.

**Architecture:** Reuse the already-parsed `Block[]` text in `KbDocument.document`. Chunk it, embed once at seed (`text-embedding-3-small` via the proxy), store vectors as JSON in a new `KbChunk` table. At edit time, a deterministic intent check decides whether to retrieve; retrieval is brute-force hybrid cosine+keyword in Node (no pgvector). Grounding is additive — it never blocks or errors an edit.

**Tech Stack:** Next.js (App Router) · TypeScript · Prisma + Postgres · `openai` SDK (embeddings, via proxy) · `@anthropic-ai/sdk` (edits, via proxy) · Vitest.

**Spec:** `docs/agentic_implementations/specs/2026-06-07-kb-retrieval-design.md`

---

## File Structure

**Create:**
- `src/lib/embeddings.ts` — `embed(texts): Promise<number[][]>` via OpenAI proxy. Only network surface.
- `src/lib/kb-chunk.ts` — `chunkBlocks(blocks): Chunk[]`. Pure.
- `src/lib/kb-retrieval.ts` — `cosine`, `keywordOverlap`, `hybridScore`, `rankChunks` (pure) + `retrieve` (db+embed).
- `src/lib/kb-intent.ts` — `wantsGrounding(instruction): boolean`. Pure.
- `src/lib/kb-suggest.ts` — `suggestKbForProposal(text, kbDocs): Suggestion[]`. Pure.
- `scripts/embed-kb.ts` — (re)build the chunk+embedding index from existing `KbDocument` rows.
- `scripts/verify-kb.ts` — ad-hoc end-to-end against the real proxy.
- `src/components/KbAttach.tsx` — proposal-level attach chips + suggestion banner (client).
- `src/app/api/proposals/[id]/kb-suggestions/route.ts` — GET suggestions.
- Test files: `src/lib/kb-chunk.test.ts`, `src/lib/kb-retrieval.test.ts`, `src/lib/kb-intent.test.ts`, `src/lib/kb-suggest.test.ts`, and additions to `src/lib/edit-service.test.ts`.

**Modify:**
- `prisma/schema.prisma` — `KbChunk` model, `KbDocument.chunks` back-relation, `Proposal.attachedKbIds`.
- `src/lib/edit-service.ts` — `EditRequest.context`, `EditResponse.groundedIn`, prompt injection, `parseEditResponse`, Mock echo.
- `src/app/api/edit/route.ts` — accept `proposalId`, intent → retrieve → inject, return `groundedIn`.
- `src/components/Editor.tsx` — send `proposalId`; show citation in the diff card.
- `src/app/api/proposals/[id]/route.ts` — PUT accepts `attachedKbIds`.
- `src/app/proposals/[id]/page.tsx` — fetch KB docs + `attachedKbIds`; pass to `Workspace`.
- `src/components/Workspace.tsx` — render `KbAttach`.
- `scripts/seed-kb.ts` — chunk + embed + insert `KbChunk` rows after each doc.

**Reference (read, do not change):** `src/lib/parse.ts` (the `Block` type), `src/lib/db.ts` (the `db` client), `scripts/verify-ai.ts` (the ad-hoc-script pattern).

---

## Task 1: Schema — KbChunk + attachedKbIds

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the back-relation to KbDocument**

In `prisma/schema.prisma`, inside `model KbDocument`, add a `chunks` relation field after `pdfData`:

```prisma
  pdfData        Bytes?   // compressed original PDF, served behind auth for the reader
  createdAt      DateTime @default(now())

  chunks KbChunk[]
}
```

- [ ] **Step 2: Add the KbChunk model**

Append after the `KbDocument` model:

```prisma
// Retrieval index: one row per ~800-char passage of a KB document, with its embedding.
model KbChunk {
  id           String     @id @default(cuid())
  kbDocumentId String
  kbDocument   KbDocument @relation(fields: [kbDocumentId], references: [id], onDelete: Cascade)
  heading      String?    // nearest preceding section heading — used in the citation
  text         String
  ordinal      Int        // order within the source doc
  embedding    Json       // number[] — text-embedding-3-small, 1536 dims

  @@index([kbDocumentId])
}
```

- [ ] **Step 3: Add attachedKbIds to Proposal**

In `model Proposal`, after `lockedFields`:

```prisma
  lockedFields          Json     @default("[]") // { label, value }[] immutable facts
  attachedKbIds         Json     @default("[]") // KbDocument ids scoped to this proposal
```

- [ ] **Step 4: Create and apply the migration**

Run: `pnpm prisma migrate dev --name kb_chunks`
Expected: migration created under `prisma/migrations/`, applied to local Postgres, and `prisma generate` runs. No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(kb): KbChunk index table + Proposal.attachedKbIds"
```

---

## Task 2: Embeddings client

**Files:**
- Create: `src/lib/embeddings.ts`
- Test: `src/lib/embeddings.test.ts`

- [ ] **Step 1: Install the OpenAI SDK**

Run: `pnpm add openai`
Expected: `openai` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `src/lib/embeddings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { embed } from './embeddings'

describe('embed', () => {
  it('returns [] for empty input without calling the network', async () => {
    expect(await embed([])).toEqual([])
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/embeddings.test.ts`
Expected: FAIL — cannot find module `./embeddings`.

- [ ] **Step 4: Implement embeddings.ts**

```ts
import OpenAI from 'openai'

const PROXY_BASE = 'https://hiring-proxy.trybuoyant.ai/openai'
const MODEL = 'text-embedding-3-small'

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (client) return client
  const token = process.env.BUOYANT_PROXY_TOKEN
  if (!token) throw new Error('BUOYANT_PROXY_TOKEN is not set — cannot embed')
  client = new OpenAI({ apiKey: token, baseURL: PROXY_BASE })
  return client
}

// Embed a batch of strings. One 1536-dim vector per input, in order.
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const res = await getClient().embeddings.create({ model: MODEL, input: texts })
  return res.data.map((d) => d.embedding as number[])
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm vitest run src/lib/embeddings.test.ts`
Expected: PASS (1 test). The empty-input path returns before `getClient()`, so no token/network needed.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/embeddings.ts src/lib/embeddings.test.ts
git commit -m "feat(kb): embeddings client (text-embedding-3-small via proxy)"
```

---

## Task 3: Chunking

**Files:**
- Create: `src/lib/kb-chunk.ts`
- Test: `src/lib/kb-chunk.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb-chunk.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { chunkBlocks } from './kb-chunk'
import type { Block } from './parse'

const b = (type: Block['type'], text: string): Block => ({ id: Math.random().toString(), type, text })

describe('chunkBlocks', () => {
  it('groups consecutive paragraphs under their nearest heading', () => {
    const out = chunkBlocks([b('heading', 'BRIDGE EXPERIENCE'), b('paragraph', 'We rehabilitated the span.'), b('paragraph', 'We managed scour.')])
    expect(out).toHaveLength(1)
    expect(out[0].heading).toBe('BRIDGE EXPERIENCE')
    expect(out[0].text).toContain('rehabilitated')
    expect(out[0].text).toContain('scour')
  })

  it('splits an oversized paragraph into multiple chunks', () => {
    const long = ('This is a sentence. ').repeat(120) // ~2400 chars
    const out = chunkBlocks([b('paragraph', long)])
    expect(out.length).toBeGreaterThan(1)
    expect(out.every((c) => c.text.length <= 1000)).toBe(true)
  })

  it('merges a tiny trailing paragraph into the previous chunk under the same heading', () => {
    const out = chunkBlocks([b('heading', 'TEAM'), b('paragraph', 'A'.repeat(300)), b('paragraph', 'PE 12345')])
    expect(out).toHaveLength(1)
    expect(out[0].text).toContain('PE 12345')
  })

  it('drops empty blocks and assigns sequential ordinals', () => {
    const out = chunkBlocks([b('paragraph', 'one'.repeat(300)), b('paragraph', '   '), b('heading', 'X'), b('paragraph', 'two'.repeat(300))])
    expect(out.map((c) => c.ordinal)).toEqual([0, 1])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/kb-chunk.test.ts`
Expected: FAIL — cannot find module `./kb-chunk`.

- [ ] **Step 3: Implement kb-chunk.ts**

```ts
import type { Block } from './parse'

export interface Chunk {
  heading: string | null
  text: string
  ordinal: number
}

const TARGET = 800 // soft max chars per chunk
const MIN = 200 // merge a chunk smaller than this into the previous (same heading)

// Group consecutive paragraph blocks under their nearest preceding heading into
// ~TARGET-char chunks. Headings reset the running buffer and become the chunk label.
export function chunkBlocks(blocks: Block[]): Chunk[] {
  const chunks: Chunk[] = []
  let heading: string | null = null
  let buf = ''

  const flush = () => {
    const text = buf.trim()
    if (text) chunks.push({ heading, text, ordinal: chunks.length })
    buf = ''
  }

  for (const block of blocks) {
    if (block.type === 'heading') {
      flush()
      heading = block.text.trim() || heading
      continue
    }
    const para = block.text.trim()
    if (!para) continue
    if (para.length > TARGET) {
      flush()
      for (const piece of splitLong(para, TARGET)) chunks.push({ heading, text: piece, ordinal: chunks.length })
      continue
    }
    if (buf && buf.length + para.length + 1 > TARGET) flush()
    buf = buf ? `${buf} ${para}` : para
  }
  flush()
  return mergeTiny(chunks)
}

function splitLong(text: string, target: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text]
  const out: string[] = []
  let buf = ''
  for (const s of sentences) {
    if (buf && buf.length + s.length > target) {
      out.push(buf.trim())
      buf = ''
    }
    buf += s
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function mergeTiny(chunks: Chunk[]): Chunk[] {
  const out: Chunk[] = []
  for (const c of chunks) {
    const prev = out[out.length - 1]
    if (prev && c.text.length < MIN && prev.heading === c.heading) {
      prev.text = `${prev.text} ${c.text}`
    } else {
      out.push({ heading: c.heading, text: c.text, ordinal: out.length })
    }
  }
  return out
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/lib/kb-chunk.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb-chunk.ts src/lib/kb-chunk.test.ts
git commit -m "feat(kb): deterministic block chunker"
```

---

## Task 4: Retrieval scorers + ranker (pure)

**Files:**
- Create: `src/lib/kb-retrieval.ts`
- Test: `src/lib/kb-retrieval.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb-retrieval.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cosine, keywordOverlap, hybridScore, rankChunks, MIN_SCORE, type Candidate } from './kb-retrieval'

describe('cosine', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('is 0 when a vector is all zeros', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe('keywordOverlap', () => {
  it('is the fraction of distinct query words present in the text', () => {
    expect(keywordOverlap('bridge scour repair', 'we managed scour on the bridge')).toBeCloseTo(2 / 3)
  })
  it('ignores short tokens and is 0 with no overlap', () => {
    expect(keywordOverlap('to of in', 'anything')).toBe(0)
    expect(keywordOverlap('demolition', 'electrical substation')).toBe(0)
  })
})

describe('hybridScore', () => {
  it('weights cosine 0.8 and keyword 0.2', () => {
    const s = hybridScore([1, 0], 'bridge', [1, 0], 'bridge work')
    expect(s).toBeCloseTo(0.8 * 1 + 0.2 * 1)
  })
})

describe('rankChunks', () => {
  const cand = (id: string, emb: number[], text: string): Candidate => ({
    kbDocumentId: id, kbTitle: id, heading: null, text, embedding: emb,
  })
  it('returns top-k sorted by score, dropping anything below MIN_SCORE', () => {
    const out = rankChunks([1, 0], 'bridge scour', [
      cand('match', [1, 0], 'bridge scour protection'),
      cand('weak', [0, 1], 'unrelated demolition text'),
    ], 3)
    expect(out).toHaveLength(1)
    expect(out[0].kbDocumentId).toBe('match')
    expect(out[0].score).toBeGreaterThanOrEqual(MIN_SCORE)
  })
  it('respects k', () => {
    const out = rankChunks([1, 0], 'bridge', [
      cand('a', [1, 0], 'bridge'), cand('b', [1, 0], 'bridge'), cand('c', [1, 0], 'bridge'),
    ], 2)
    expect(out).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/kb-retrieval.test.ts`
Expected: FAIL — cannot find module `./kb-retrieval`.

- [ ] **Step 3: Implement the pure parts of kb-retrieval.ts**

```ts
import { db } from './db'
import { embed } from './embeddings'

export interface RetrievedChunk {
  kbDocumentId: string
  kbTitle: string
  heading: string | null
  text: string
  score: number
}

export interface Candidate {
  kbDocumentId: string
  kbTitle: string
  heading: string | null
  text: string
  embedding: number[]
}

export const MIN_SCORE = 0.28 // below this, don't ground (tune via scripts/verify-kb.ts)
const COSINE_W = 0.8
const KEYWORD_W = 0.2

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []

// Fraction of the query's distinct words that appear in the text (0..1).
export function keywordOverlap(query: string, text: string): number {
  const q = new Set(words(query))
  if (q.size === 0) return 0
  const t = new Set(words(text))
  let hit = 0
  for (const w of q) if (t.has(w)) hit++
  return hit / q.size
}

export function hybridScore(queryEmb: number[], queryText: string, chunkEmb: number[], chunkText: string): number {
  return COSINE_W * cosine(queryEmb, chunkEmb) + KEYWORD_W * keywordOverlap(queryText, chunkText)
}

// Pure ranker — unit-tested without db/network.
export function rankChunks(queryEmb: number[], queryText: string, candidates: Candidate[], k: number): RetrievedChunk[] {
  return candidates
    .map((c) => ({
      kbDocumentId: c.kbDocumentId,
      kbTitle: c.kbTitle,
      heading: c.heading,
      text: c.text,
      score: hybridScore(queryEmb, queryText, c.embedding, c.text),
    }))
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// Orchestrator: embed the query, load candidate chunks (optionally scoped), rank.
export async function retrieve(query: string, opts: { kbIds?: string[]; k?: number } = {}): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 3
  const where = opts.kbIds && opts.kbIds.length ? { kbDocumentId: { in: opts.kbIds } } : {}
  const rows = await db.kbChunk.findMany({
    where,
    select: { kbDocumentId: true, heading: true, text: true, embedding: true, kbDocument: { select: { title: true } } },
  })
  if (rows.length === 0) return []
  const [queryEmb] = await embed([query])
  const candidates: Candidate[] = rows.map((r) => ({
    kbDocumentId: r.kbDocumentId,
    kbTitle: r.kbDocument.title,
    heading: r.heading,
    text: r.text,
    embedding: r.embedding as unknown as number[],
  }))
  return rankChunks(queryEmb, query, candidates, k)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/lib/kb-retrieval.test.ts`
Expected: PASS (the `cosine`, `keywordOverlap`, `hybridScore`, `rankChunks` suites). `retrieve` is exercised later by `scripts/verify-kb.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb-retrieval.ts src/lib/kb-retrieval.test.ts
git commit -m "feat(kb): hybrid cosine+keyword retrieval with min-score guard"
```

---

## Task 5: Grounding-intent detector

**Files:**
- Create: `src/lib/kb-intent.ts`
- Test: `src/lib/kb-intent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb-intent.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { wantsGrounding } from './kb-intent'

describe('wantsGrounding', () => {
  it('is true for instructions that pull in real content', () => {
    for (const i of [
      'add a sentence about our bridge scour experience',
      'include details from our past work',
      'expand on our MoDOT grant experience',
      'mention a similar project',
      'elaborate with more detail',
    ]) expect(wantsGrounding(i)).toBe(true)
  })
  it('is false for pure phrasing edits', () => {
    for (const i of ['tighten this', 'make it more formal', 'change Dixon to Walia', 'fix the typo'])
      expect(wantsGrounding(i)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/kb-intent.test.ts`
Expected: FAIL — cannot find module `./kb-intent`.

- [ ] **Step 3: Implement kb-intent.ts**

```ts
const GROUNDING = [
  /\badd\b/i,
  /\binclude\b/i,
  /\bexpand\b/i,
  /\belaborate\b/i,
  /\bmore detail/i,
  /\b(past|previous|prior) (work|proposal|project|experience)/i,
  /\bsimilar (project|proposal|work)/i,
  /\bfrom our\b/i,
  /\breference\b/i,
  /\bcite\b/i,
  /\bbased on\b/i,
  /\bmention\b/i,
]

// True when the instruction implies pulling in real content from past proposals.
export function wantsGrounding(instruction: string): boolean {
  return GROUNDING.some((re) => re.test(instruction))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/lib/kb-intent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb-intent.ts src/lib/kb-intent.test.ts
git commit -m "feat(kb): deterministic grounding-intent detector"
```

---

## Task 6: Build the index (script + seed) and verify it populates

**Files:**
- Create: `scripts/embed-kb.ts`
- Modify: `scripts/seed-kb.ts`

- [ ] **Step 1: Write embed-kb.ts**

Create `scripts/embed-kb.ts`:

```ts
// (Re)build the KB retrieval index from existing KbDocument.document rows.
// Does NOT re-parse PDFs. Run: node --env-file=.env --import tsx scripts/embed-kb.ts
import type { Prisma } from '@prisma/client'
import { db } from '../src/lib/db'
import { chunkBlocks } from '../src/lib/kb-chunk'
import { embed } from '../src/lib/embeddings'
import type { Block } from '../src/lib/parse'

async function main() {
  const docs = await db.kbDocument.findMany()
  await db.kbChunk.deleteMany()
  for (const doc of docs) {
    const blocks = (doc.document ?? []) as unknown as Block[]
    const chunks = chunkBlocks(blocks)
    if (chunks.length === 0) {
      console.log(`kb: ${doc.title} — no chunks, skipped`)
      continue
    }
    const vectors = await embed(chunks.map((c) => c.text))
    await db.kbChunk.createMany({
      data: chunks.map((c, i) => ({
        kbDocumentId: doc.id,
        heading: c.heading,
        text: c.text,
        ordinal: c.ordinal,
        embedding: vectors[i] as unknown as Prisma.InputJsonValue,
      })),
    })
    console.log(`kb: ${doc.title} — ${chunks.length} chunks embedded`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
```

- [ ] **Step 2: Fold chunk+embed into seed-kb.ts**

In `scripts/seed-kb.ts`, add imports at the top (after the existing imports):

```ts
import { chunkBlocks } from '../src/lib/kb-chunk'
import { embed } from '../src/lib/embeddings'
```

Then, immediately after the existing `await db.kbDocument.create({ ... })` call (capture its return), index the doc. Replace:

```ts
    await db.kbDocument.create({
      data: {
        title: parsed.title,
        sourceFilename: file,
        projectType: type,
        document: parsed.blocks as unknown as Prisma.InputJsonValue,
        pdfData: pdf,
      },
    })
    console.log(`kb: ${parsed.title}  (${type}, ${(pdf.length / 1e6).toFixed(1)}MB pdf)`)
```

with:

```ts
    const doc = await db.kbDocument.create({
      data: {
        title: parsed.title,
        sourceFilename: file,
        projectType: type,
        document: parsed.blocks as unknown as Prisma.InputJsonValue,
        pdfData: pdf,
      },
    })
    const chunks = chunkBlocks(parsed.blocks)
    const vectors = chunks.length ? await embed(chunks.map((c) => c.text)) : []
    if (chunks.length)
      await db.kbChunk.createMany({
        data: chunks.map((c, i) => ({
          kbDocumentId: doc.id,
          heading: c.heading,
          text: c.text,
          ordinal: c.ordinal,
          embedding: vectors[i] as unknown as Prisma.InputJsonValue,
        })),
      })
    console.log(`kb: ${parsed.title}  (${type}, ${(pdf.length / 1e6).toFixed(1)}MB pdf, ${chunks.length} chunks)`)
```

- [ ] **Step 3: Build the index against the existing local KB**

Run: `node --env-file=.env --import tsx scripts/embed-kb.ts`
Expected: one `… N chunks embedded` line per KB doc, no errors. (Requires `BUOYANT_PROXY_TOKEN` in `.env` and the KB already seeded; if the KB is empty, run `pnpm db:seed` flow / `scripts/seed-kb.ts` first.)

- [ ] **Step 4: Verify rows landed**

Run: `node --env-file=.env --import tsx -e "import('./src/lib/db').then(async ({db})=>{console.log('chunks:', await db.kbChunk.count()); await db.\$disconnect()})"`
Expected: `chunks:` followed by a number > 0 (a few hundred).

- [ ] **Step 5: Commit**

```bash
git add scripts/embed-kb.ts scripts/seed-kb.ts
git commit -m "feat(kb): build embedding index at seed + standalone embed-kb script"
```

---

## Task 7: Edit service — accept context, return groundedIn

**Files:**
- Modify: `src/lib/edit-service.ts`
- Test: `src/lib/edit-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/edit-service.test.ts` inside the existing `describe('parseEditResponse', …)` block:

```ts
  it('parses groundedIn when present on a valid edit', () => {
    const r = parseEditResponse(
      JSON.stringify({ proposedText: 'MECO rehabilitated the NEMO bridge.', rationale: 'added', changedEntities: [], groundedIn: ['NEMO Bridge SOQ'] }),
      BLOCK,
    )
    expect(r.groundedIn).toEqual(['NEMO Bridge SOQ'])
  })
  it('omits groundedIn when absent', () => {
    const r = parseEditResponse(JSON.stringify({ proposedText: 'MECO marks 40 years.', rationale: '' }), BLOCK)
    expect(r.groundedIn).toBeUndefined()
  })
```

And add a new block for the Mock echoing context:

```ts
describe('MockEditService with context', () => {
  it('echoes provided sources into groundedIn', async () => {
    const r = await svc.proposeEdit({
      blockText: 'We serve municipalities.',
      instruction: 'add a sentence about our bridge work',
      context: [{ source: 'NEMO Bridge SOQ', text: 'MECO rehabilitated the NEMO bridge.' }],
    })
    expect(r.groundedIn).toEqual(['NEMO Bridge SOQ'])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/edit-service.test.ts`
Expected: FAIL — `groundedIn` undefined / `context` not accepted.

- [ ] **Step 3: Extend the interfaces**

In `src/lib/edit-service.ts`, replace the `EditRequest`/`EditResponse` block:

```ts
export interface EditContext {
  source: string
  heading?: string
  text: string
}
export interface EditRequest {
  blockText: string
  instruction: string
  context?: EditContext[] // retrieved KB passages to ground the edit in
}
export interface EditResponse {
  proposedText: string
  rationale: string
  changedEntities: string[] // entities the edit intentionally changed; [] = none (faithfulness)
  clarification?: string // set when the model can't/won't edit — show a question, NOT a diff
  groundedIn?: string[] // KB source titles the edit actually drew from
}
```

- [ ] **Step 4: Parse groundedIn in parseEditResponse**

In `parseEditResponse`, change the success return (the final `return { proposedText, … }`) to:

```ts
  return {
    proposedText,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    changedEntities: Array.isArray(parsed.changedEntities)
      ? parsed.changedEntities.filter((e): e is string => typeof e === 'string')
      : [],
    ...(Array.isArray(parsed.groundedIn)
      ? { groundedIn: parsed.groundedIn.filter((s: unknown): s is string => typeof s === 'string') }
      : {}),
  }
```

- [ ] **Step 5: Refactor MockEditService to echo context**

Replace the `MockEditService` class body so the rule logic moves into a private `compute`, and `proposeEdit` adds `groundedIn` when context is present:

```ts
export class MockEditService implements EditService {
  async proposeEdit(req: EditRequest): Promise<EditResponse> {
    const base = this.compute(req.blockText, req.instruction)
    return req.context?.length ? { ...base, groundedIn: req.context.map((c) => c.source) } : base
  }

  private compute(blockText: string, instruction: string): EditResponse {
    const instr = instruction.trim()

    const rep =
      instr.match(/(?:change|replace|fix|rename|swap)\s+["']?(.+?)["']?\s+(?:to|with|->|→|for)\s+["']?(.+?)["']?$/i) ??
      instr.match(/["']?(.+?)["']?\s+should be\s+["']?(.+?)["']?$/i)
    if (rep && rep[1] && rep[2] && blockText.includes(rep[1])) {
      const [, from, to] = rep
      const count = blockText.split(from).length - 1
      return {
        proposedText: blockText.split(from).join(to),
        rationale: `Replaced "${from}" → "${to}" (${count}×). Nothing else changed.`,
        changedEntities: [`${from}→${to}`],
      }
    }

    if (/tighten|shorten|concise|trim|cut|condense/i.test(instr)) {
      const tightened = blockText.replace(FILLER, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim()
      return { proposedText: cap(tightened), rationale: 'Tightened: removed filler words; kept all names, figures, and claims.', changedEntities: [] }
    }

    if (/formal|professional|polish/i.test(instr)) {
      const formal = blockText
        .replace(/\bdon't\b/gi, 'do not')
        .replace(/\bcan't\b/gi, 'cannot')
        .replace(/\bwe're\b/gi, 'we are')
        .replace(/\bit's\b/gi, 'it is')
        .replace(/and Selection Committee,/, 'and Members of the Selection Committee,')
      return { proposedText: formal, rationale: 'Formalized phrasing (expanded contractions); preserved all names.', changedEntities: [] }
    }

    return { proposedText: cap(blockText.replace(/\s+/g, ' ').trim()), rationale: 'Light cleanup; no facts changed.', changedEntities: [] }
  }
}
```

- [ ] **Step 6: Inject context in ProxyEditService**

Replace `ProxyEditService.proposeEdit` with:

```ts
  async proposeEdit({ blockText, instruction, context }: EditRequest): Promise<EditResponse> {
    const grounded = !!context?.length
    const pastWork = grounded
      ? '\n\nPAST WORK (the firm\'s real past proposals — ground the edit in these where they genuinely fit; do NOT invent):\n' +
        context!.map((c) => `[source: ${c.source}${c.heading ? ` — ${c.heading}` : ''}]\n${c.text}`).join('\n\n')
      : ''
    const system =
      'You revise ONE paragraph of a civil-engineering proposal. Apply only the requested change. ' +
      'Never alter client names, people, license numbers, dates, or figures unless explicitly asked. ' +
      (grounded
        ? 'When you use a fact from PAST WORK, do not invent details, and list the source titles you actually drew from in "groundedIn" (string[], [] if none). '
        : '') +
      'If the instruction is too vague, ambiguous, or unsafe to make a confident single-paragraph edit, ' +
      'do NOT guess and do NOT write any prose into proposedText — instead return ' +
      '{"clarification": "<one short question asking what to change>"} and leave proposedText empty. ' +
      'Otherwise reply with JSON only: {"proposedText": string, "rationale": string, "changedEntities": string[]' +
      (grounded ? ', "groundedIn": string[]' : '') +
      '}.'
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: `Paragraph:\n${blockText}\n\nInstruction: ${instruction}${pastWork}` }],
    })
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    return parseEditResponse(text, blockText)
  }
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/lib/edit-service.test.ts`
Expected: PASS (all prior tests + 3 new).

- [ ] **Step 8: Commit**

```bash
git add src/lib/edit-service.ts src/lib/edit-service.test.ts
git commit -m "feat(kb): edit service accepts KB context, returns groundedIn citations"
```

---

## Task 8: Wire retrieval into the edit API

**Files:**
- Modify: `src/app/api/edit/route.ts`

- [ ] **Step 1: Replace the route body**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getEditService, type EditContext } from '@/lib/edit-service'
import { wantsGrounding } from '@/lib/kb-intent'
import { retrieve } from '@/lib/kb-retrieval'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Propose an AI edit for one block. Grounds in the KB when the instruction asks for it.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { blockText, instruction, proposalId } = await req.json().catch(() => ({}))
  if (typeof blockText !== 'string' || typeof instruction !== 'string' || !instruction.trim()) {
    return NextResponse.json({ error: 'blockText and instruction are required' }, { status: 400 })
  }

  let context: EditContext[] | undefined
  if (wantsGrounding(instruction)) {
    let kbIds: string[] | undefined
    if (typeof proposalId === 'string') {
      const p = await db.proposal.findUnique({ where: { id: proposalId }, select: { attachedKbIds: true } })
      const ids = (p?.attachedKbIds ?? []) as unknown as string[]
      if (Array.isArray(ids) && ids.length) kbIds = ids
    }
    try {
      const hits = await retrieve(`${instruction}\n${blockText}`, { kbIds })
      if (hits.length) context = hits.map((h) => ({ source: h.kbTitle, heading: h.heading ?? undefined, text: h.text }))
    } catch (err) {
      console.error('kb retrieve failed — proceeding ungrounded', err) // grounding is additive
    }
  }

  const result = await getEditService().proposeEdit({ blockText, instruction, context })
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/edit/route.ts
git commit -m "feat(kb): edit API retrieves + injects KB context on grounding instructions"
```

---

## Task 9: Editor — send proposalId, show the citation

**Files:**
- Modify: `src/components/Editor.tsx`

- [ ] **Step 1: Send proposalId with the propose request**

In `propose()`, change the fetch body from `JSON.stringify({ blockText: target.text, instruction })` to:

```ts
      body: JSON.stringify({ blockText: target.text, instruction, proposalId }),
```

- [ ] **Step 2: Render the citation under the rationale**

In the `phase === 'diff'` render, immediately after the rationale line
`<p className="mt-2 text-[11px] text-mute">ⓘ {proposed.rationale}</p>`, add:

```tsx
                  {proposed.groundedIn && proposed.groundedIn.length > 0 && (
                    <p className="mt-1 text-[11px] font-medium text-periwinkle">
                      📎 Grounded in: {proposed.groundedIn.join(', ')}
                    </p>
                  )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "feat(kb): editor sends proposalId and shows the grounding citation"
```

---

## Task 10: Verify Layer 1 end-to-end against the real proxy

**Files:**
- Create: `scripts/verify-kb.ts`

- [ ] **Step 1: Write verify-kb.ts**

```ts
// Verify KB retrieval + grounded edit against the real proxy.
//   node --env-file=.env --import tsx scripts/verify-kb.ts
import { retrieve } from '../src/lib/kb-retrieval'
import { wantsGrounding } from '../src/lib/kb-intent'
import { getEditService } from '../src/lib/edit-service'
import { db } from '../src/lib/db'

async function main() {
  const blockText = 'MECO Engineering serves municipalities across northeast Missouri.'
  const instruction = 'add a sentence about our bridge rehabilitation experience'

  console.log('wantsGrounding:', wantsGrounding(instruction))
  const hits = await retrieve(`${instruction}\n${blockText}`)
  console.log(`\nretrieved ${hits.length} chunk(s):`)
  for (const h of hits) console.log(`  [${h.score.toFixed(3)}] ${h.kbTitle} — ${(h.heading ?? '').slice(0, 40)}: ${h.text.slice(0, 80)}…`)

  const context = hits.map((h) => ({ source: h.kbTitle, heading: h.heading ?? undefined, text: h.text }))
  const r = await getEditService().proposeEdit({ blockText, instruction, context })
  console.log('\nbefore :', blockText)
  console.log('after  :', r.proposedText)
  console.log('grounded:', r.groundedIn ?? [])
}

main()
  .catch((e) => {
    console.error('ERROR:', e?.message ?? e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
```

- [ ] **Step 2: Run it**

Run: `node --env-file=.env --import tsx scripts/verify-kb.ts`
Expected (with `USE_REAL_AI=true` and `BUOYANT_PROXY_TOKEN` set): `wantsGrounding: true`, one or more retrieved chunks from the bridge SOQ with scores ≥ 0.28, an `after` paragraph that adds a bridge sentence, and `grounded:` listing the bridge source. If `grounded` is empty or no chunks return, lower `MIN_SCORE` in `kb-retrieval.ts` and re-run — record the working value.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-kb.ts src/lib/kb-retrieval.ts
git commit -m "test(kb): ad-hoc end-to-end grounding verification script"
```

**Layer 1 is now complete: grounding works end-to-end with citations.**

---

## Task 11: Proposal PUT accepts attachedKbIds

**Files:**
- Modify: `src/app/api/proposals/[id]/route.ts`

- [ ] **Step 1: Replace the PUT handler**

```ts
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Persist the edited document (Block[]) and/or the attached KB ids.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: Prisma.ProposalUpdateInput = {}
  if (Array.isArray(body.document)) data.document = body.document as unknown as Prisma.InputJsonValue
  if (Array.isArray(body.attachedKbIds)) data.attachedKbIds = body.attachedKbIds as unknown as Prisma.InputJsonValue
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'document (Block[]) or attachedKbIds is required' }, { status: 400 })
  }

  try {
    await db.proposal.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/proposals/[id]/route.ts
git commit -m "feat(kb): proposal PUT accepts attachedKbIds"
```

---

## Task 12: Suggestion scorer (pure)

**Files:**
- Create: `src/lib/kb-suggest.ts`
- Test: `src/lib/kb-suggest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb-suggest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { suggestKbForProposal, type KbDocLike } from './kb-suggest'

const docs: KbDocLike[] = [
  { id: 'bridge', title: 'NEMO RPC Bridge SOQ', projectType: 'Bridge' },
  { id: 'demo', title: 'Hannibal Demolition SOQ', projectType: 'Demolition' },
]

describe('suggestKbForProposal', () => {
  it('ranks the matching project type first', () => {
    const out = suggestKbForProposal('We propose bridge rehabilitation and scour repair for the county.', docs)
    expect(out[0].id).toBe('bridge')
    expect(out[0].why).toMatch(/bridge/i)
  })
  it('excludes already-attached docs', () => {
    const out = suggestKbForProposal('bridge work', docs, { exclude: ['bridge'] })
    expect(out.find((s) => s.id === 'bridge')).toBeUndefined()
  })
  it('omits docs with zero overlap', () => {
    const out = suggestKbForProposal('electrical substation design', docs)
    expect(out.find((s) => s.id === 'demo')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/kb-suggest.test.ts`
Expected: FAIL — cannot find module `./kb-suggest`.

- [ ] **Step 3: Implement kb-suggest.ts**

```ts
export interface KbDocLike {
  id: string
  title: string
  projectType: string | null
}
export interface Suggestion {
  id: string
  title: string
  why: string
  score: number
}

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []

// Deterministic: score each KB doc against the proposal text by projectType mention
// + title/term overlap. Returns matches with score > 0, best first.
export function suggestKbForProposal(
  proposalText: string,
  kbDocs: KbDocLike[],
  opts: { exclude?: string[] } = {},
): Suggestion[] {
  const exclude = new Set(opts.exclude ?? [])
  const lower = proposalText.toLowerCase()
  const docWords = new Set(words(proposalText))
  const out: Suggestion[] = []

  for (const kb of kbDocs) {
    if (exclude.has(kb.id)) continue
    let score = 0
    const reasons: string[] = []

    const type = kb.projectType?.toLowerCase().trim()
    if (type && lower.includes(type)) {
      score += 2
      reasons.push(`mentions "${kb.projectType}"`)
    }
    const titleHits = [...new Set(words(kb.title).filter((w) => docWords.has(w)))]
    if (titleHits.length) {
      score += titleHits.length
      reasons.push(`shares "${titleHits.slice(0, 3).join(', ')}"`)
    }
    if (score > 0) out.push({ id: kb.id, title: kb.title, why: reasons.join('; '), score })
  }
  return out.sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/kb-suggest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb-suggest.ts src/lib/kb-suggest.test.ts
git commit -m "feat(kb): deterministic KB suggestion scorer"
```

---

## Task 13: Suggestions API

**Files:**
- Create: `src/app/api/proposals/[id]/kb-suggestions/route.ts`

- [ ] **Step 1: Implement the GET route**

```ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { suggestKbForProposal } from '@/lib/kb-suggest'
import type { Block } from '@/lib/parse'

export const runtime = 'nodejs'

// Suggest KB docs to attach, based on the proposal's text. Deterministic.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const proposal = await db.proposal.findUnique({ where: { id }, select: { document: true, attachedKbIds: true } })
  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  const text = ((proposal.document ?? []) as unknown as Block[]).map((b) => b.text).join(' ').slice(0, 5000)
  const attached = (proposal.attachedKbIds ?? []) as unknown as string[]
  const kbDocs = await db.kbDocument.findMany({ select: { id: true, title: true, projectType: true } })
  const suggestions = suggestKbForProposal(text, kbDocs, { exclude: attached }).slice(0, 2)

  return NextResponse.json({ suggestions })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/proposals/[id]/kb-suggestions/route.ts"
git commit -m "feat(kb): proposal KB-suggestions endpoint"
```

---

## Task 14: Attach UI — chips + suggestion banner

**Files:**
- Create: `src/components/KbAttach.tsx`
- Modify: `src/app/proposals/[id]/page.tsx`, `src/components/Workspace.tsx`

- [ ] **Step 1: Build the KbAttach component**

Create `src/components/KbAttach.tsx`:

```tsx
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
      <p className="mt-1 mb-2 text-xs leading-relaxed text-mute">
        Attach past proposals to ground “add / expand” edits in real work.
      </p>

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
                <span className="ml-2 text-[10px] uppercase tracking-wide">{on ? '✓ attached' : 'attach'}</span>
              </button>
            </li>
          )
        })}
        {kbDocs.length === 0 && <li className="text-xs text-mute">No KB documents.</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Fetch KB data on the proposal page**

In `src/app/proposals/[id]/page.tsx`, after the `proposal` fetch and the `blocks`/`locked` lines, add:

```ts
  const kbDocs = await db.kbDocument.findMany({ select: { id: true, title: true, projectType: true }, orderBy: { createdAt: 'desc' } })
  const attachedKbIds = (proposal.attachedKbIds ?? []) as unknown as string[]
```

Then change the `<Workspace … />` call to pass them:

```tsx
      <Workspace proposalId={proposal.id} blocks={blocks} lockedFields={locked} kbDocs={kbDocs} attachedKbIds={attachedKbIds} />
```

- [ ] **Step 3: Thread props through Workspace and render KbAttach**

In `src/components/Workspace.tsx`, add the import:

```ts
import { KbAttach, type KbOption } from './KbAttach'
```

Extend the props type and signature:

```ts
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
```

Then, inside the `<aside>`, after the locked-facts `</ul>` (before `</aside>`), add:

```tsx
        <KbAttach proposalId={proposalId} kbDocs={kbDocs} initialAttached={attachedKbIds} />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/KbAttach.tsx src/components/Workspace.tsx src/app/proposals/[id]/page.tsx
git commit -m "feat(kb): proposal-level attach chips + suggestion banner"
```

**Layers 2 and 3 are now complete: scoping + suggestion-on-open.**

---

## Task 15: Full suite, typecheck, deploy

**Files:** none (verification + ship)

- [ ] **Step 1: Run the whole unit suite**

Run: `pnpm test`
Expected: all unit tests pass (existing + the new kb-chunk, kb-retrieval, kb-intent, kb-suggest, embeddings, and edit-service additions).

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: Next build succeeds.

- [ ] **Step 4: Manual smoke (local)**

Run `pnpm dev`, open a proposal, attach the bridge KB (or accept the suggestion), select a paragraph, instruct "add a sentence about our bridge experience", and confirm the diff card shows "📎 Grounded in: …". Confirm "tighten this" shows no citation.

- [ ] **Step 5: Build the prod index**

The prod migration runs automatically on deploy (`prisma migrate deploy` in `vercel-build`), but the prod `KbChunk` rows must be built once against the prod DB:

Run: `node --env-file=.env.production.local --import tsx scripts/embed-kb.ts`
Expected: `… N chunks embedded` per doc against the prod database. (Uses the gitignored prod-credentials file; never commit or print it.)

- [ ] **Step 6: Deploy**

```bash
git push origin main
vercel --prod --yes
```

- [ ] **Step 7: Verify on prod**

Open the live URL, run a grounding edit, confirm the citation appears.

---

## Self-Review notes

- **Spec coverage:** data model (Task 1) · embeddings (Task 2) · chunk (Task 3) · retrieval+guard (Task 4) · intent (Task 5) · index build/seed (Task 6) · inject+groundedIn (Task 7) · edit API (Task 8) · editor citation (Task 9) · verify (Task 10) · scoping PUT (Task 11) · suggest scorer (Task 12) · suggest API (Task 13) · attach UI + suggestion banner (Task 14) · ship (Task 15). All spec sections map to a task.
- **Type consistency:** `Chunk`, `Candidate`, `RetrievedChunk`, `EditContext`, `EditResponse.groundedIn`, `KbOption`, `Suggestion`, `KbDocLike` are each defined once and used consistently. `retrieve(query, {kbIds,k})`, `rankChunks(queryEmb, queryText, candidates, k)`, `wantsGrounding(instruction)`, `suggestKbForProposal(text, docs, {exclude})`, `embed(texts)` signatures match every call site.
- **Out-of-scope honored:** no pgvector, reranker, windowing, or LLM classifier — pure-function deterministic pieces with one embedding network call.
