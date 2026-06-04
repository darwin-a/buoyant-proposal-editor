# Design — AI PDF Proposal Edit Loop

**Date:** 2026-06-03
**Status:** In design — collaborative, problem-by-problem (see *Collaboration & identity*)
**Goal:** Close the core edit loop on `easy.pdf`, end-to-end, on a deployed URL — then
extend it into a **collaborative** proposal editor.

## North star

A consultant uploads a proposal PDF, selects a paragraph, tells the AI what to
do in plain language, sees a diff, and applies it. Edits compose; undo reverses
the last one. **Closing this loop is the whole bar** — it ships first and
protects the submission. Beyond it, the flagship bet is **collaboration**
(teammates working a proposal together), which is why identity and persistence
are now in scope — see *Collaboration & identity*. KB grounding, hard.pdf, PDF
export, and multi-paragraph chat remain later/stretch.

## Approved decisions

- **Representation — Approach A (reconstructed blocks).** Parse the PDF once into
  a structured `DocumentModel` and render *that* as clean editable blocks, not
  the original pixels. The brief permits dropping visual fidelity. This makes
  selection, applying edits, composition, and undo trivial.
- **Parsing — hybrid.** Deterministic extraction (`pdfjs-dist`) + heuristic
  segmentation is the always-works baseline (no token, sub-second on easy.pdf).
  An *optional* LLM cleanup pass (merge broken lines, label headings) is a
  quality upgrade, **cached to disk by file SHA-256** so it runs at most once
  per file. Loop works today without it.
- **AI seam.** All model calls sit behind an `EditService` interface.
  `MockEditService` (deterministic, token-free) ships now; `ProxyEditService`
  (Anthropic SDK → `https://hiring-proxy.trybuoyant.ai/anthropic`) drops in via
  env when the token arrives. One-line swap, no other code changes.
- **Interaction — inline, paragraph unit.** The instruction box and diff appear
  *on the selected paragraph*; the user's eye never leaves their content. Side-
  panel/chat is the deliberate *later* retrofit for multi-paragraph editing.
- **Backend — real, local, ours (NO Supabase / no BaaS).** We build a normal
  full-stack app — Next.js frontend + our own backend (API routes) + a **local
  database** — and run it locally. *Deployment/host is deferred and ignored for now.*
  The backend is thin and hand-built: it stores proposals, collaborators, and the edit
  log, and serves the edit loop. Local DB = a simple SQL store (e.g. SQLite via an ORM);
  swapping it for a hosted Postgres later is a late-binding, one-line change.
- **Stack.** Next.js (App Router) + TypeScript · Tailwind · `diff` (word-level) ·
  `@anthropic-ai/sdk` (later). PDF→structure parse: TBD (see *Parsing research*).
- **Deployment + DB vendor — DEFERRED (late-binding).** The design only assumes
  "some persistence" for collaboration; *which* host/DB (any serverless Postgres) is a
  decision we make at the end. Not thinking about it now.

## Architecture

```
Browser (client)
  ├─ Upload dropzone
  ├─ Document view — renders DocumentModel as editable blocks
  ├─ Per-block: select → instruction input → inline diff → Apply / Reject
  └─ Edit history (compose + undo) in client state

Server (route handlers)
  ├─ POST /api/parse  → sha256(file) → disk cache lookup →
  │     pdfjs extract (text + geometry) → heuristic segmentation →
  │     [optional] LLM cleanup → DocumentModel (write cache)
  └─ POST /api/edit   → EditService.proposeEdit(block, instruction, ctx)
                        → { proposedText }
```

## Data model

```ts
DocumentModel { id: string; title: string; blocks: Block[] }
Block { id: string; type: 'heading' | 'paragraph' | 'list'; text: string; level?: number }
EditOp { id: string; blockId: string; before: string; after: string;
         instruction: string; appliedAt: number }
```

- Blocks carry **stable ids**; every edit/diff/undo addresses a block by id.
- History is a stack of `EditOp`. Apply pushes; undo pops and restores `before`.
- Composition is automatic: each apply mutates exactly one block.

> **Revised by collaboration:** in the loop-only v1, `EditOp` lives in client state.
> Once collaboration lands, the proposed edit becomes a **persisted, authored** record
> (`author`, `status`, AI rationale) in our own minimal store so teammates can
> review/approve. The block model is unchanged; only where edits live and who can act
> on them changes. Final data model + store choice is its own design problem.

## The edit loop (UX)

1. Land → single upload affordance.
2. Upload → parsing state shows the document skeleton forming (honest, not a
   frozen spinner). easy.pdf is near-instant on the deterministic path.
3. Document renders as readable, styled blocks — the trust moment.
4. Hover a paragraph → it reads as editable; click to select.
5. Inline instruction input appears for that block; user types plain language.
6. AI returns a revision → shown as an inline word-level diff on that paragraph.
   Nothing is changed yet.
7. Apply (swap text in place, push history) or Reject (dismiss, untouched).
8. Repeat on other paragraphs — edits compose.
9. Undo reverses the last apply.

## Mock AI behavior (token-free demo)

`MockEditService` returns deterministic, plausible edits so the loop is fully
demoable before the token lands:

- "fix name X to Y" / "X should be Y" → literal replacement in the block.
- "tighten" / "shorten" → strip filler words / collapse whitespace.
- anything else → return the block prefixed/marked as an AI rewrite so the diff
  is visibly non-trivial.

Replaced wholesale by `ProxyEditService` later; the interface and the UI do not
change.

## Target lock

**SOQs for small teams.** Every fixture is a Statement of Qualifications: 8–19 pages,
highly templated, recycled from the last one, mostly firm-overview + team + experience.
Written by a **proposal coordinator** + a **principal who signs off** — Buoyant's
stated customer: *"small teams that write a lot of proposals."* We design for *that*,
not the 50-person live-multiplayer design-build *bid* war room (a different document
type for a bigger customer — explicitly out of scope).

## Collaboration — lightweight, self-built (the flagship beyond-brief bet)

**Why it's grounded (not scope creep).** Even a short SOQ is a two-person artifact: a
coordinator tailors it, a principal reviews and signs. The core loop is *already
collaboration-shaped*: someone **proposes** a change, someone **decides** whether to
apply it. Extending "AI proposes → you approve" to "a teammate proposes → the principal
approves" is a natural differentiator (G3, D3.6).

**Two grounding insights:**
- **Review is the human QA layer over AI edits.** A proposal cannot misstate a client
  name, PE license number, project number, or claim unearned work — exactly what an AI
  might hallucinate. The reviewer approving a proposed edit *is* the trust mechanism
  that makes AI-edited proposals safe to send. Collaboration ⇒ faithfulness.
- **"Proposal = codebase, reviews = PR reviews."** The right mental model is
  GitHub, not Google-Docs-same-cursor: people work different **sections** and merge
  through **review** — not character-level co-typing. So we get the collaborative feel
  from section-parallel work + review, not from CRDT.

**Identity — keep it simple, ourselves.** A **shareable link** (coordinator shares a
proposal; the principal opens it, enters a name) — no accounts, no email provider, no
BaaS. Identity = the name on the link. (Full magic-link auth is a later upgrade, not
needed for a two-person SOQ review.)

**Persistence — minimal, self-built (NOT Supabase).** The core loop ships
backend-free. Collaboration needs *some* shared store so two people see one proposal;
we use the lightest self-owned option (the exact store is an open decision below). The
**proposed edit** becomes a persisted, **authored** object: `author`, `status`
(pending / approved / rejected / applied), AI rationale — replacing v1's client-only
`EditOp` stack. A reviewer can also leave a plain-language **edit request** on a block
("tighten this") for the drafter or AI to fulfill. An **approval trail** (who
proposed/approved what) gives real value in a sign-off culture and a strong demo story.

**Sync is simple too.** Sharing + refresh/poll to see a teammate's change is enough for
two people on a short doc. Live presence/cursors are deliberately **out of scope** —
over-engineering for this user; not worth a realtime backend.

**Build order (protects R2).** ① core loop on `easy.pdf`, deployed, **backend-free** →
② shareable-link review & approval (minimal self-built store) → ③ polish.

## Out of scope (cut, by design — see README rationale)

KB grounding · multi-paragraph chat · PDF export · hard.pdf · visual fidelity to the
original · full account auth (shareable link instead) · live presence/cursors · the
50-person multiplayer bid war room (wrong document/customer). Named as stretch/cut so
the loop closes first.

## Failure modes to watch (for the README eval section later)

- Segmentation splits/merges paragraphs wrongly → edits target the wrong unit.
- AI silently changes a name or number the user didn't ask to change (faithfulness).
- Parse cache keyed on file bytes only → fine; but stale model schema must
  invalidate cache (include a model-version in the cache key).
- Unseen grading fixture with odd layout → deterministic baseline must not crash;
  degrade to "one block per page" rather than error.
