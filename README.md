# Buoyant — AI Proposal Editor

Upload a civil-engineering proposal PDF, recover its structure, and edit it section by section
with AI. You see the proposed change as a diff, decide whether to apply it, stack multiple edits,
and undo. Edits can be grounded in the firm's past proposals.

**Live:** https://darwinagunos-buoyant.vercel.app
**Demo login:** passwordless — pick any seeded account (e.g. `darwin@mecoengineering.com`).

The loop runs end to end on the deployed app: upload → recover paragraphs → select one →
tell the AI what to do → review the diff → apply → repeat or undo.

My take on this project up front: technology isn't the moat here. You can't be stupid about it —
the engineering has to be solid — but the hard part is the design. Understanding what the firm and
the person writing the proposal actually need is where the value is, and it's where I spent most of
my time.

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

**AI mode.** The deployed demo runs real Claude (`claude-sonnet-4-6`) through the Buoyant proxy.
To run real AI locally, set `USE_REAL_AI=true` and `BUOYANT_PROXY_TOKEN=...` in `.env`. Without a
token, the app falls back to a deterministic editor so the loop still works offline and in tests —
see §2.

> **On the example fixtures.** MECO's proposals are proprietary, so they're not committed to this
> repo. `pnpm db:seed` creates the demo users; the knowledge-base and sample-proposal seeds
> (`scripts/seed-kb.ts`, `scripts/seed-proposals.ts`) need the fixture PDFs locally. Without them the
> app works the same — just upload any PDF to start.

```bash
pnpm test            # unit tests (parser, locked-fields, edit service)
pnpm test:e2e        # Playwright — the edit loop + upload + locked-field guard
pnpm eval            # name-fidelity eval (§5)
```

---

## 2. Design decisions

### Parsing the PDF
I parse the PDF with deterministic rules — pdfjs for the text geometry, regex for the structure —
instead of handing it to an LLM. PDF parsing isn't an unsolved problem, and I wanted to save tokens
wherever I could, so I only reach for the model when it's the only thing that can do the job.

What the parser does (`src/lib/parse.ts`):
- groups glyphs into lines by their Y position and infers spacing from the X gaps;
- drops "shadow text" — these PDFs draw each string twice with a small offset for a drop-shadow
  effect, so I remove the near-duplicate by position instead of guessing;
- recovers headings (all-caps and short, or larger font) and merges wrapped multi-line headings;
- detects the facts that must not change (client, project number, recipient, dates, PE license,
  emails, phone) by regex, and locks them.

The output is an ordered list of blocks (`heading` / `paragraph`) plus the locked fields. The
tradeoff is honest: this handles a clean single-column SOQ well, and it falls down on multi-column
pages and other awkward layouts. The brief says the core problem is the edit loop, not PDF
reconstruction, so I recover a clean editable structure rather than chase visual fidelity.

### The AI edit
`EditService` (`src/lib/edit-service.ts`) is a small interface: given a paragraph and an
instruction, return the proposed text, a short rationale, and the list of entities the edit
intentionally changed. There are two implementations behind it:

- **Real Claude** (`ProxyEditService`) — `claude-sonnet-4-6` via the Buoyant proxy. This is what the
  deployed app runs. The system prompt keeps it to one paragraph, the requested change only, and not
  touching names, licenses, dates, or figures unless asked.
- **A deterministic editor** (`MockEditService`) — rule-based rewrites with no token or network. I
  started with this to save tokens early on, and it stays useful: it drives the whole loop in tests
  and powers the eval in §5 without spend. It's a baseline, not the product.

The important field is the list of changed entities: the model declares what it meant to change, so
anything else that drifts is something the UI can catch (the locked-field guard below).

If an instruction is too vague to act on safely, the model returns a question instead of a guess, and
the UI shows that question with no diff and no Apply button. A fuzzy "change this a bit" used to get
the model's "could you clarify?" reply stuffed into the diff as the new paragraph; now it can't
quietly mangle the text.

### Grounding edits in past work
The firm's five past proposals are the knowledge base, and an "add" or "expand" edit can pull real
content from them instead of inventing it. The pipeline reuses the text the parser already recovered
(`KbDocument.document`), so the large PDFs never touch retrieval:

- chunk each past proposal into ~800-char passages under their section headings (`src/lib/kb-chunk.ts`);
- embed them once at seed (`text-embedding-3-small` via the proxy) and store the vectors as JSON;
- at edit time, retrieve by a hybrid score — 0.8 cosine + 0.2 keyword overlap — inject the top
  passages, and show a citation ("Grounded in: City of Warrenton") that links to the source PDF.

A few choices worth calling out. The vectors live in Postgres and I score them in memory; at a few
hundred chunks that's instant, and pgvector would be solving a problem I don't have. Retrieval runs on
the *instruction's* topic, not the paragraph being edited — the paragraph is often boilerplate (a
cover letter, an "OUR FIRM" intro) that matches the near-identical boilerplate in every past proposal
and buries what you actually asked for. A minimum-score guard means a weak match grounds in nothing
rather than the wrong precedent. And you can attach specific past proposals to a document to scope
retrieval: once something's attached, every content edit grounds against it by default, while pure
phrasing edits (tighten, make formal) skip it.

### UX
- A TipTap/ProseMirror editor where each block has an ID. Select text and a floating trigger appears
  (Google-Docs style) → type an instruction → see a diff → apply or discard.
- Edits stack, and the editor's history gives undo (⌘Z).
- A locked-facts panel shows the protected facts live. If an edit would change one, it's flagged in
  the diff — amber if you asked for it, red if it's collateral — so a name change is visible the
  moment it happens, not after you've submitted.
- A knowledge base (`/kb`): the firm's five past proposals, browsable and readable as the original
  PDF behind login, so edits can be grounded in real past work.

### Database
Optional per the brief, but I used Postgres + Prisma because proposals, their edit history, users
and roles, and the KB corpus all need to persist. It also supports the way these firms actually work
— a coordinator drafts, a licensed PE reviews and signs off.

### Uploads on a serverless host
Parsing runs in the browser, and only the recovered structure (a few KB of JSON) is posted to the
server. The fixtures are 13–18 MB, and Vercel rejects request bodies over 4.5 MB at the edge, so a
server-side parse would have failed on exactly the files this is meant to handle. Parsing client-side
sidesteps that limit entirely and is faster too. The server validates the JSON before saving it.

---

## 3. What I cut, and why

I had roughly four focused hours, so I scoped hard and kept the loop closing over adding features.

- **Multi-paragraph edits.** The biggest cut. One instruction spanning several blocks is a lot harder
  (coordinating and reconciling changes across blocks). The per-paragraph loop is the bar, so that's
  where I spent the time. (Grounding edits in the KB was the other big one — I went back and built it;
  see §2 and §6.)
- **Export back to PDF.** The edited document lives as structured blocks. Re-rendering to a PDF is a
  separate problem and I'd want to do it properly (see §7).
- **The hard fixture.** The parser targets a single-column SOQ. Multi-column reading order and tables
  are their own project, so I designed it to degrade rather than pretend to handle them.
- **Real auth.** Passwordless demo login. The interesting problem here is the edit loop, not credentials.

## 4. Failure modes I worried about

- **The nondeterministic AI path is the one that worries me most.** In this domain a rewrite is
  costly — a wrong name, a wrong project number, or a malformed section can get an SOQ thrown out
  before anyone reads the substance. So the guardrails have to be good enough to surface the changes
  that would do that, and realistically most proposals should stay human-in-the-loop. I'm not trying
  to automate the engineer out; I'm trying to make the expensive mistakes visible before they ship.
- **Silent parse failures.** A heading read as prose, shadow text not fully removed, or multi-column
  text interleaved. These don't error — they produce a subtly wrong document. Before a paying
  customer I'd add a parse-confidence signal and a "does this look right?" review step on import.
- **Collateral fact changes.** An AI edit that drifts a client name or license number while doing
  something else. The changed-entities field plus the locked-field guard catch this, but they rely on
  the model declaring its changes honestly. I'd add an independent diff check on the protected
  entities that doesn't trust the model's own report.
- **Strict vs. semantic fact matching.** The guard matches facts verbatim. The eval in §5 caught a
  case where rewording a salutation tripped it even though the name survived — real systems need
  fuzzy/semantic entity tracking, not substring equality.

## 5. How I'd evaluate this

The metric I picked is **name/entity fidelity**: across many edits, do the protected facts (client,
recipient, project number, PE license, dates, emails) survive? I chose this because it ties straight
to the failure mode above — a silently changed client name is exactly the kind of thing that gets an
SOQ tossed, so it's the most diagnostic thing to measure. `scripts/eval.ts` runs four
"preserve everything" instructions over every fact-bearing paragraph and checks each fact survives.

Run against the deterministic editor on the single-column fixture (the harness is provider-agnostic;
`USE_REAL_AI=true pnpm eval` runs the same checks against real Claude):

```
Edits run:     76   (4 instructions × 19 fact-bearing blocks)
Entity checks: 132
Preserved:     131
Fidelity:      99.2%
Failure (1):   [make this more formal] lost "Mayor Wiles and Selection Committee"
```

The one failure is instructive: "make this more formal" reworded the salutation, so the locked
recipient phrase no longer matched verbatim. The name survived — the guard was just too strict. That's
real signal that entity tracking should be semantic, not substring (§4).

## 6. What I added beyond the brief

- **Grounding edits in past work.** This was my #1 next-step, and I went back and built it. An
  "add"/"expand" edit retrieves from the firm's real past proposals and grounds the change in them,
  with a citation that links back to the source PDF — so a claim about bridge experience comes from an
  actual past bridge project, not the model's imagination. How it works is in §2.
- **The KB as a readable corpus.** You can browse the firm's five past proposals and read the
  original PDF in-app, served behind login (the bytes live in Postgres, compressed 69 MB → 14 MB, and
  never touch the repo or `/public` because they're proprietary). It's also the corpus the grounding
  retrieves from.
- **The live locked-facts guard.** These proposals are full of facts that can't drift — license
  numbers, client names. Surfacing them live, and separating an intentional change from a collateral
  one in the diff, is the thing I'd want most as a real user, and it's the direct answer to the
  failure mode I care about.
- **A clarification guard on vague instructions.** When the model can't act on an instruction safely,
  it returns a question rather than a guess, shown with no Apply button — so a fuzzy ask can't quietly
  rewrite a paragraph. Details in §2.

I'd add more given the time — see below.

## 7. What I'd build next given another 8 hours

1. **Deep-link citations to the exact page.** The "Grounded in" citation already opens the source
   PDF; it just can't jump to the spot, because chunks don't carry page numbers yet. I'd thread page
   numbers through the parser into the chunks and link to `#page=N` so a reviewer lands on the
   passage the edit came from.
2. **Approval workflows and comments.** Draft → request a PE review → comment / approve / reject, on
   the roles that already exist. This is how the firm actually signs off on a proposal.
3. **Export.** There are a few ways to solve it; I'd look into real PDF editing first rather than
   re-rendering from scratch.
4. **Semantic locked-fact tracking** to fix the §5 failure, and **handling the hard fixture**
   (multi-column reading order + tables).

---

## Architecture at a glance

Next.js (App Router) · TypeScript · Prisma + Postgres · TipTap · pdfjs (deterministic parse,
client-side) · Anthropic SDK (edits) and OpenAI SDK (embeddings) via the Buoyant proxy · in-memory
hybrid retrieval. Deployed on Vercel + Vercel Postgres (Neon). See `docs/agentic_implementations/`
for specs, the implementation plan, and the deploy runbook.
