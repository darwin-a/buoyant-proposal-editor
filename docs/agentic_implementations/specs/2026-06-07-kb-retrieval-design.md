# Design — Knowledge-Base Retrieval (grounding edits in past proposals)

**Date:** 2026-06-07
**Status:** Approved — building all three layers in order.
**Goal:** When a user asks the AI to *add* or *expand* a paragraph, ground the edit in the
firm's real past proposals (the `kb/` corpus) — with a citation back to the source — instead of
letting the model invent details.

## North star

A coordinator selects a paragraph and types *"add a sentence about our bridge scour experience."*
Today Claude makes something up. With retrieval, the app pulls the relevant passage from
`nemo_rpc_bridge_soq.pdf`, feeds it to the model, and the diff card shows **"Grounded in: NEMO
Bridge SOQ."** Wrong precedent is worse than none, so retrieval refuses to ground when nothing
genuinely matches.

## Where the data comes from (and why size is a non-issue)

The KB text is **already extracted**. `scripts/seed-kb.ts` runs each past proposal through the
same `parsePdf` as a normal upload and stores the result as `Block[]` JSON in
`KbDocument.document`. The large thing about these docs is the **PDF bytes** (`pdfData`, up to ~19
scanned pages) — and retrieval never reads those. Plain text is tiny: even the largest SOQ is
~30–60 KB of text, a few hundred chunks across all five docs combined.

```
PDF bytes (huge, ignored for retrieval)
   │  parsePdf  ← already done at seed
   ▼
Block[] text (small, in DB)  ──chunk──►  ~few hundred chunks  ──embed once──►  KbChunk rows
                                                                                  │
                                                          query ──cosine in memory──┘
```

**No premature optimization, deliberately.** One-time offline embedding at seed; brute-force
cosine over a few hundred float arrays at query time (microseconds). pgvector / ANN indexes,
chunk-overlap windowing, and rerankers are all real RAG techniques that solve problems we do not
have at 5 docs. They are out of scope and noted as a choice.

## Data model (Prisma)

```prisma
model KbChunk {
  id           String     @id @default(cuid())
  kbDocumentId String
  kbDocument   KbDocument @relation(fields: [kbDocumentId], references: [id], onDelete: Cascade)
  heading      String?    // nearest preceding section heading — used in the citation
  text         String
  ordinal      Int        // order within the source doc
  embedding    Json       // number[] — text-embedding-3-small, 1536 dims
}

// KbDocument gains the back-relation:  chunks KbChunk[]
// Proposal gains:                      attachedKbIds Json @default("[]")  // KbDocument ids in scope
```

Embeddings as `Json` (a `number[]`), not pgvector: a few hundred vectors brute-forced in Node is
trivial and keeps the stack dependency-light. Honest limit: this does not scale to thousands of
docs — correct call for five.

## Components (small, single-purpose, pure where possible)

- **`src/lib/kb-chunk.ts`** — `chunkBlocks(blocks: Block[]): Chunk[]`. Groups consecutive
  paragraph blocks under their nearest preceding heading into ~500–800-char chunks; merges tiny
  blocks, splits oversized ones. Carries `heading` for the citation. Pure, deterministic.
- **`src/lib/embeddings.ts`** — `embed(texts: string[]): Promise<number[][]>` via the OpenAI SDK
  pointed at the proxy `/openai` base, model `text-embedding-3-small`. Batched. The only network
  surface; thin so callers stay testable.
- **`src/lib/kb-intent.ts`** — `wantsGrounding(instruction: string): boolean`. Deterministic
  keyword/regex match ("add", "include", "expand", "elaborate", "more detail", "from
  past/previous work", "similar project", "reference", "cite", "based on"). Token-free; only
  grounding instructions trigger retrieval. A plain "tighten this" never retrieves.
- **`src/lib/kb-retrieval.ts`** — pure scorers + the orchestrator:
  - `cosine(a, b)`, `keywordOverlap(query, text)` — pure.
  - `hybridScore = 0.8·cosine + 0.2·keywordOverlap` (keyword normalized 0–1).
  - `retrieve(query, { kbIds?, k = 3 }): Promise<RetrievedChunk[]>` — embeds the query, loads
    candidate chunks (restricted to `kbIds` when given), ranks by `hybridScore`, returns top-K.
  - **Min-score guard:** if the best chunk is below `MIN_SCORE`, return `[]` — do not ground.
- **`src/lib/kb-suggest.ts`** — `suggestKbForProposal(proposalText, kbDocs): Suggestion[]`.
  Deterministic: scores each KB doc by `projectType` + title/term overlap with the proposal text;
  returns top matches with a short `why`. No model call.

## The three layers

**Layer 1 — core grounding loop.** Chunk + embed at seed. On an edit, the API detects grounding
intent, retrieves top-K from the whole KB, injects the passages into the edit prompt, and the diff
card shows the citation.

- `EditRequest` gains `context?: { source: string; heading?: string; text: string }[]`.
- `EditResponse` gains `groundedIn?: string[]` — the sources the model says it actually used.
- `ProxyEditService` prompt, when `context` is present: *"You may ground this edit in the firm's
  past proposals below. Use only facts that genuinely fit; do not invent. Cite the sources you use
  by title in `groundedIn`; if none fit, ignore them and leave `groundedIn` empty."*
- `MockEditService` ignores `context` (stays deterministic) but echoes provided sources into
  `groundedIn` so the loop is testable without spend.

**Layer 2 — proposal-level scoping.** `attachedKbIds` on the proposal; a chip control on the
proposal page (PUT to the existing `/api/proposals/[id]`). Retrieval restricts to attached docs;
if none attached, falls back to the whole KB so Layer 1 works before anything is attached.

**Layer 3 — suggestion on open.** On the proposal page, `kb-suggest` scores the KB against the
proposal and shows a dismissible banner: *"This reads like a Bridge SOQ — attach NEMO Bridge
proposal? [Attach] [Dismiss]."* Deterministic; trivially upgradable to an LLM scan later.

## API wiring

- **`/api/edit`** (`route.ts`) — accept `proposalId` in addition to `blockText` + `instruction`.
  If `wantsGrounding(instruction)`: read `proposal.attachedKbIds`, `retrieve(query, {kbIds})`, pass
  `context` to `proposeEdit`. Return the proposed edit plus `groundedIn`.
- **`/api/proposals/[id]`** (PUT) — accept `attachedKbIds` alongside the existing `document` update.
- **`/api/proposals/[id]/kb-suggestions`** (GET) — returns suggested `{id, title, why}` not already
  attached.

## UX

- **Diff card** (`Editor.tsx`) — when `groundedIn` is non-empty, a small line under the rationale:
  *"📎 Grounded in: NEMO Bridge SOQ."* Nothing when an edit wasn't grounded.
- **Proposal page** — an "Attached knowledge base" row of toggle chips (the 5 KB docs), and the
  suggestion banner from Layer 3.

## Scripts

- **`scripts/embed-kb.ts`** — `node --env-file=.env --import tsx scripts/embed-kb.ts`. (Re)builds
  the chunk+embedding index from existing `KbDocument.document` rows without re-parsing PDFs.
- **`scripts/seed-kb.ts`** — after creating each `KbDocument`, chunk + embed + insert `KbChunk` rows.
- **`scripts/verify-kb.ts`** — ad-hoc end-to-end against the real proxy (mirrors `verify-ai.ts`):
  run a grounding instruction, print the retrieved sources, scores, and the grounded edit.

## Testing

Everything hard is a pure function, unit-tested with no network:

- `kb-chunk` — groups under headings, merges tiny blocks, splits oversized; carries heading.
- `kb-retrieval` — `cosine` correctness, `keywordOverlap`, `hybridScore` weighting, and the
  min-score guard returns `[]` on weak matches.
- `kb-intent` — matches grounding phrases, rejects "tighten"/"make formal".
- `kb-suggest` — ranks the matching `projectType` first.

The embedding network call is covered by `scripts/verify-kb.ts` against the real proxy. One e2e
spec (attach a KB → grounding instruction → citation visible) if time allows.

## Failure modes guarded

- **Wrong precedent injected** → min-score guard + Layer 2 scoping narrow the candidate set; the
  model is told to ignore passages that don't fit and to report what it actually used.
- **Silent grounding** → the citation makes grounding visible in the diff; an ungrounded edit shows
  no citation. The user always sees whether past work was used.
- **Embedding/network failure at query time** → retrieval returns `[]` and the edit proceeds
  ungrounded rather than erroring; grounding is additive, never a blocker.

## Out of scope (chosen, not overlooked)

pgvector / ANN, rerankers, chunk-overlap windowing, multi-proposal retrieval, an LLM-based intent
classifier, and an LLM-based suggestion scan. All real techniques; none earn their place at five
documents in this time budget.
