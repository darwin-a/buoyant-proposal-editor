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
- **Parsing — pure JS, our own structure recovery + AI fallback (decided).** `pdfjs`
  extracts text + geometry; we recover structure *ourselves* in TS: **dedup** the
  shadow-layered text, detect **headings by bold + brevity** (not font size — the real
  fixture lesson), join lines into paragraphs, type the blocks → a markdown-shaped
  `Block[]`. **AI-via-proxy is the fallback** for PDFs the deterministic path mangles
  (covers the unseen grading fixture, C7). **Cached** by file SHA-256 (+ a parser-version
  key). Hand-rolling this is deliberate — it shows our approach to the structure-recovery
  problem the brief highlights, instead of hiding it behind a library.
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
  log, and serves the edit loop. Local DB = **PostgreSQL via Prisma**, **containerized**
  (`docker-compose` runs the app + Postgres) so local matches prod.
- **Stack.** Next.js (App Router) + TypeScript · Tailwind · `diff` (word-level) ·
  `@anthropic-ai/sdk` (later) · **PostgreSQL + Prisma** · **Docker** (`docker-compose`) ·
  `pdfjs-dist` (parse). PDF→blocks: pure-JS recovery + AI-via-proxy fallback (decided).
- **Cloud host — still deferred.** Engine is Postgres now (not vendor-locked); *where* it
  deploys is a late-binding call. App + DB run locally via Docker until then.

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

## Data model (settled — DB vendor still deferred)

The core single-player loop needs **none** of this (client state + parse cache). The DB
enters only with persistence + collaboration.

```ts
// Persisted entities. Blocks live inside the Proposal as JSON (no separate Block table).
User { id: string; name: string; email: string; role: 'coordinator' | 'principal' | 'engineer' }
Proposal {
  id: string; title: string; sourceFilename: string;
  document: Block[];          // ordered blocks from the markdown parse
  createdById: string;        // FK → User (attribution; every firm user can open any proposal)
  reviewRequestedFrom?: string; // FK → User (light "request review from X" — not access control)
  lockedFields: { label: string; value: string }[]; // immutable facts — deterministic-detected, user-confirmed
  createdAt: number;
}
Block { id: string; type: 'heading' | 'paragraph' | 'list'; text: string; level?: number }

// ONE table doubles as the edit log AND the review queue.
Edit {
  id: string; proposalId: string; blockId: string;
  authorId: string;           // FK → User (real login)
  kind: 'manual' | 'ai';
  instruction?: string;       // ai only
  before: string; after: string;
  rationale?: string; changedEntities?: string[];   // ai trust signals (faithfulness)
  status: 'applied' | 'pending' | 'approved' | 'rejected';
  reviewedBy?: string; reviewedAt?: number;          // approval trail
  createdAt: number;
}
```

- **Real login over a seeded `User` table:** sign in by email; edits/reviews are
  attributed to your user. Lets us demo the review flow by switching coordinator ↔ principal.
- **Blocks carry stable ids**; every edit/diff/undo/review addresses a block by id.
- **Manual edits apply immediately** (`status: 'applied'`); the author may also apply their
  own AI edits directly.
- **Review = live edits + sign-off (Model A, decided):** edits apply immediately
  (`status: 'applied'`); a reviewer then `approve`s (✓ sign-off) or `reject`s (flags for
  revision — *no* auto-revert of mid-history edits) each edit. `Proposal.reviewRequestedFrom`
  kicks off a review. Status flow `applied → approved | rejected`; `pending` is reserved for
  a future suggestion-mode. `reviewedBy`/`reviewedAt` form the approval trail.
- **Undo** reverses the last applied edit (reads the log).

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

**Identity — real login over a seeded `User` table (built ourselves).** We seed the DB
with the firm's actual team (real MECO names from the proposals). You **sign in by email**;
edits and reviews are attributed to your user. Simple to build, no BaaS, and it lets us
demo the review flow by switching between a coordinator and a principal. (Passwords / OAuth
are later polish — email-match sign-in is enough for the demo.)

**Seed users** (from the real MECO proposals; email domain `mecoengineering.com` is the
one printed in the Dixon SOQ):

| name | email | role |
|------|-------|------|
| Sarah Mills | smills@mecoengineering.com | coordinator (drafts/recycles) |
| Donald Jenkins | djenkins@mecoengineering.com | principal (VP/PM — the real Dixon signer; approves) |
| Scott Vogler | svogler@mecoengineering.com | principal (President; approves) |
| David Uhlig | duhlig@mecoengineering.com | engineer (verifies technical sections) |
| Kevin Garnett | kgarnett@mecoengineering.com | engineer (contributor) |

*Sarah Mills is invented (no marketing coordinator is named in the SOQs); the rest are real
team members. `djenkins@mecoengineering.com` is literally printed in the Dixon proposal.*

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

## Evaluation (D3.5) — decided: name/entity fidelity

Do edits preserve protected facts unless explicitly asked to change them? A failure =
an edit silently altered a protected entity.

- **Protected entities (gold list, from the corpus):** client (City of Dixon), mayor
  (Mary Wiles), firm (MECO), project no. (041-560), PE names + license numbers, and key
  figures (40th anniversary, 60 professionals, seven offices, 55 miles).
- **Test set:** "preserve-everything" instructions (tighten / rewrite / more formal) over
  blocks that contain those entities.
- **Scoring (independent — NOT self-report):** extract gold entities from `before`, assert
  each still appears in `after`. Fidelity = % preserved; list every failure. (`changedEntities`
  from the EditService is only a hint; the harness checks the actual text.)
- **README number:** e.g. "96% — 48/50 entities preserved across 20 edits; 2 failures: …"
- **Runs on the mock now** (deterministic → instant real numbers) and **re-runs on the proxy
  later** (real LLM numbers) via the same harness. Closes the brief's "measure X → here's X."

## Failure modes to watch (README §4)

- Segmentation splits/merges paragraphs wrongly → edits target the wrong unit.
- AI silently changes a name or number the user didn't ask to change (faithfulness).
- Parse cache keyed on file bytes only → fine; but stale model schema must
  invalidate cache (include a model-version in the cache key).
- Unseen grading fixture with odd layout → deterministic baseline must not crash;
  degrade to "one block per page" rather than error.
