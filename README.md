# Buoyant — AI Proposal Editor

Upload a civil-engineering proposal PDF, recover its structure, and edit it section-by-section
with AI — see a diff, apply it, compose multiple edits, undo. Grounded in the firm's past work.

**Live:** https://darwinagunos-buoyant.vercel.app
**Demo login:** passwordless — pick any seeded account (e.g. `darwin@mecoengineering.com`).

The core loop closes end-to-end on the deployed app: **upload → recover paragraphs → select one →
instruct the AI → review the diff → apply → (repeat / undo).**

---

## 1. Setup & run

**Prereqs:** Node 24, pnpm, Docker (for local Postgres).

```bash
pnpm install
docker compose up -d                       # Postgres on localhost:5434

cp .env.example .env                        # then set:
#   DATABASE_URL="postgresql://buoyant:buoyant@localhost:5434/buoyant"
#   DIRECT_URL="postgresql://buoyant:buoyant@localhost:5434/buoyant"
#   AUTH_SECRET="$(openssl rand -base64 32)"

pnpm prisma migrate deploy                  # create tables
pnpm db:seed                                # demo users
pnpm dev                                    # http://localhost:3005
```

Open http://localhost:3005, sign in with a seeded email, upload a PDF, and edit.

**AI mode.** The editor defaults to a **deterministic, token-free editor** (`MockEditService`) so the
loop is fully usable with zero API spend. To use real Claude via the Buoyant proxy, set
`USE_REAL_AI=true` and `BUOYANT_PROXY_TOKEN=...` in `.env`. (See §2 for why this is the default.)

> **On the example fixtures.** MECO's proposals are proprietary and are **not** committed to this
> repo. `pnpm db:seed` creates the demo users; the knowledge-base and sample-proposal seeds
> (`scripts/seed-kb.ts`, `scripts/seed-proposals.ts`) require the fixture PDFs locally. Without them,
> the app works exactly the same — just **upload any PDF** to start.

```bash
pnpm test            # unit tests (parser, locked-fields, edit service)
pnpm test:e2e        # Playwright (the edit loop + locked-field guard)
pnpm eval            # name-fidelity eval (§5)
```

---

## 2. Design decisions

### PDF representation — recover structure, don't reproduce pixels
PDFs expose glyphs at coordinates, not paragraphs. The brief is explicit that **the core problem is
the edit loop, not PDF reconstruction**, so I recover a clean editable *structure* rather than chase
visual fidelity.

`src/lib/parse.ts` is a **deterministic, geometry-aware parser** (pdfjs + rules, no LLM):
- group glyphs into lines by Y position, infer spacing from X gaps;
- **dedup "shadow text"** — these PDFs render text twice (a drop-shadow offset), so I drop near-duplicate
  runs by position rather than by guessing;
- recover **headings** (ALL-CAPS + short, or large font) and merge wrapped multi-line headings;
- detect **immutable facts** (client, project no., recipient, dates, PE license, emails, phone) by regex.

The output is an ordered `Block[]` (`heading` / `paragraph`) plus `lockedFields`. Choosing rules over
an LLM here is deliberate: it's **instant, free, and debuggable** — "these are patterns this firm's
documents follow," not a model I have to trust. (The brief notes AI parsing can take 5–10 min; this is
sub-second.)

### Agent design — one paragraph, one change, faithful by default
`EditService` (`src/lib/edit-service.ts`) is a tiny interface: `proposeEdit({blockText, instruction})`
→ `{proposedText, rationale, changedEntities}`. Two implementations behind a factory:

- **`MockEditService`** — deterministic rules (rename, tighten, formalize, cleanup). Drives the entire
  loop with **no token and no network**, so the product is demoable and testable independently of the
  proxy. **This is the default even when a token is present**, so a public URL can't rack up spend.
- **`ProxyEditService`** — real Claude (`claude-sonnet-4-6`) via the Buoyant proxy, same interface,
  same JSON contract. The system prompt constrains it to *one paragraph, only the requested change,
  never touch names/licenses/dates/figures unless asked.*

`changedEntities` is the key field: the model declares what it *intentionally* changed, so anything
else that drifts is a **silent violation** the UI can flag (§locked-field guard).

### UX — edit in place, decide before applying
- **TipTap/ProseMirror** editor; each block carries a `blockId`. Selecting text reveals a floating
  ✨ trigger (Google-Docs style) → type an instruction → see a **diff** → **Apply** or discard.
- **Multiple edits compose**; the editor's history gives **undo** (⌘Z) for free.
- **Locked-facts rail** shows the protected facts live; if an edit would change one, it's flagged
  **amber (intentional)** vs **red (collateral)** in the diff *and* the rail updates — so name drift is
  visible the moment it happens, not after submission.
- **Knowledge base** (`/kb`): the firm's 5 past proposals, browsable and readable as the **original PDF**
  (served behind login), so edits can be grounded in real past work.

### Database — Postgres + Prisma
Optional per the brief, but it earns its place: proposals, their edit history, users/roles
(principal / engineer / coordinator), and the KB corpus all persist. It also enables the
collaboration framing (a coordinator drafts, a PE reviews) that fits how these firms actually work.

---

## 3. What I cut and why

- **Visual PDF fidelity / reconstruction.** Explicitly out of scope per the brief; commercial-grade and
  not where the value is. I recover *structure*, not layout.
- **KB *grounding into edits* (RAG).** The KB is browsable/readable, but the AI doesn't yet retrieve from
  it ("add a paragraph about a similar project"). It's the highest-value next step (§7), but real
  retrieval done well is more than the remaining budget — a shallow version would've been worse than none.
- **Multi-paragraph chat.** Significantly harder (cross-block coordination, conflicting edits); the
  per-paragraph loop is the bar and where I invested.
- **Export back to PDF.** The edited document lives as structured blocks; re-rendering to PDF is a
  separate problem with little marginal user value for the demo.
- **The hard fixture (tables / multi-column).** The parser targets `easy.pdf`'s single column; multi-column
  reading-order is its own project. I designed to *degrade*, not to handle it.
- **Real auth.** Passwordless demo login — the interesting problem is the edit loop, not credentials.

## 4. Failure modes I worried about

- **Silent parse failures.** The riskiest class — a heading mis-detected as prose, shadow-text not fully
  deduped, or multi-column text interleaved. These don't error; they just produce a subtly wrong document.
  *Before a paying customer:* a parse-confidence signal + a "does this look right?" review step on import.
- **Collateral fact changes.** An AI edit that drifts a client name or license number while doing
  something else. Mitigated by `changedEntities` + the locked-field guard, but it depends on the model
  *declaring* changes honestly — I'd add an independent post-edit diff check on protected entities.
- **Strict vs. semantic fact matching.** The guard matches facts *verbatim*; the eval (§5) caught a case
  where formalizing a salutation reworded a locked phrase and tripped a false-ish positive. Real systems
  need fuzzy/semantic entity tracking, not substring equality.
- **AI mode honesty.** The deterministic editor is *not* AI — a demo that silently faked it would be
  dishonest. The README and UI are explicit about which engine is running.
- **Serverless edges.** Pooled DB connections under load; large-PDF parse exceeding the function timeout
  (mitigated: demo data is pre-parsed; live uploads are bounded).

## 5. How I'd evaluate this — and what it actually is

**Metric: name/entity fidelity** — across many edits, do protected facts (client, recipient, project no.,
PE license, dates, emails) survive? In this domain, a silently changed client name is the worst failure,
so this is the most diagnostic thing to measure. `scripts/eval.ts` runs four "preserve-everything"
instructions over every fact-bearing paragraph and checks each fact survives.

**Run against the shipped editor (`MockEditService`), `easy.pdf`:**

```
Edits run:     76   (4 instructions × 19 fact-bearing blocks)
Entity checks: 132
Preserved:     131
Fidelity:      99.2%
Failure (1):   [make this more formal] lost "Mayor Wiles and Selection Committee"
```

**What the one failure tells us:** "make this more formal" reworded the salutation
(*"…and Selection Committee," → "…and Members of the Selection Committee,"*), so the locked recipient
phrase no longer matched verbatim. The *name* survived; the **verbatim guard was too strict** — a real
signal that entity tracking should be semantic, not substring (see §4). The harness is
provider-agnostic (`USE_REAL_AI=true pnpm eval` runs the same checks against real Claude), so the same
number guards the LLM path before it ships.

## 6. What I added beyond the brief, and why

- **Knowledge base as a readable corpus.** Browse the firm's 5 past proposals and read the **original
  PDF** in-app — bytes stored in Postgres and served **behind login** (compressed 69 MB → 14 MB; never
  in the repo or `/public`, because they're proprietary). Past work is the raw material for grounding.
- **Live locked-facts guard.** A construction firm's proposals are full of facts that must *never* drift
  (license numbers, client names). Surfacing them live — and color-coding intentional vs collateral
  changes in the diff — is the feature I'd want most as a real user.
- **Deterministic-first AI.** A token-free editor that makes the whole loop demoable, testable, and
  **free of accidental spend** on a public URL — and doubles as the honest baseline in §5.
- **Collaboration framing.** Roles (PE / engineer / coordinator) and a review hook, because in these
  firms a coordinator drafts and a licensed PE signs off.

## 7. What I'd build next given another 8 hours

1. **KB grounding (RAG).** Retrieve relevant past-proposal passages and let the AI pull from them —
   "add a paragraph about a similar bridge project" cites a real one. The KB is already structured for it.
2. **Semantic locked-fact tracking.** Replace verbatim matching with entity-aware checks (the §5 failure).
3. **Multi-paragraph instructions.** One instruction spanning sections, with per-block diffs.
4. **Real review/approval workflow.** Draft → request PE review → approve/reject, on the existing roles.
5. **Hard fixture.** Multi-column reading-order + table handling.
6. **Export** to PDF/DOCX, and **streaming** AI edits for perceived speed.

---

## Architecture at a glance

Next.js (App Router) · TypeScript · Prisma + Postgres · TipTap · pdfjs (deterministic parse) ·
Anthropic SDK via the Buoyant proxy. Deployed on Vercel + Vercel Postgres (Neon).
See `docs/agentic_implementations/` for specs, the implementation plan, and the deploy runbook.
