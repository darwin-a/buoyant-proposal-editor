# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Greenfield. As of this writing there is **no implementation yet** — only the assessment brief
(full spec in the Notion doc linked from `README.md`) and example fixtures under `docs/`. No build,
lint, or test commands exist yet because no code exists. The required stack is fixed (below); pick
the rest.

## What this is

The Buoyant.ai "Founding Engineer" take-home. Build a **web app that lets a user upload a proposal
PDF and edit it section-by-section with AI**. Buoyant builds AI tools for firms that write civil-
engineering / infrastructure proposals (SOQs — Statements of Qualifications).

### The core loop (this is the bar — it must close end-to-end on a deployed app)

1. User uploads a PDF.
2. The PDF is rendered in the browser so the user can interact with its content.
3. User selects a unit (a paragraph, or whatever unit you decide is right) and asks the AI to act on
   it — rewrite, tighten, fix names, change tone, add info from a knowledge base, etc.
4. AI returns a *proposed* change; the user sees a diff and decides whether to apply.
5. Applied changes update the document. **Multiple edits compose. Undo if possible.**

> *"A submission that doesn't close this loop won't pass review — no matter how polished the parts
> that do work are. Scope aggressively so the loop closes before you reach for anything else."*

**`docs/ExampleProposals/proposals/easy.pdf` must work end-to-end on the deployed app.** That is the
minimum bar. Recovering structure (paragraphs/sections/headings) from a PDF — which exposes none of
it natively — is itself a real engineering problem the graders want to see addressed. But the README
is explicit: *"The core problem is the edit loop, not PDF reconstruction."* Don't chase visual fidelity.

## Hard constraints (from the brief)

- **Stack: Next.js + TypeScript.** Beyond that, your call.
- **Deployment:** Vercel recommended; must end up at a public running URL.
- **Database: optional.** Use one only if it earns its place (Supabase / Vercel Postgres / none).
- **AI access is via a proxy**, not direct provider keys — see below.
- **Time budget ≈ 4 focused hours.** Product taste and a closed loop beat feature quantity.
  *"Two thoughtful additions beat ten half-finished ones."*

## AI proxy

Drop-in replacement for the official OpenAI and Anthropic APIs. Use the official SDKs and point
`baseURL` at the proxy; use the provided token in place of a provider key. Spend is capped — budget
calls.

- Base URL: `https://hiring-proxy.trybuoyant.ai`
- OpenAI: `baseURL: 'https://hiring-proxy.trybuoyant.ai/openai'`
- Anthropic: `baseURL: 'https://hiring-proxy.trybuoyant.ai/anthropic'`
- **Auth token is sent separately and is NOT in the repo yet.** Store it as an env var (e.g.
  `BUOYANT_PROXY_TOKEN`); never commit it. The token is the same for both providers.

Request shapes, models, and streaming behave exactly as the official SDKs document.

## Fixtures (`docs/ExampleProposals/`)

Real MECO Engineering proposals, shared with permission. See `docs/ExampleProposals/README.txt`.

- `proposals/easy.pdf` — 8-page single-column SOQ. **Primary dev target; make this work end-to-end.**
- `proposals/hard.pdf` — 19-page SOQ with tables, mixed sections, branding. Stretch only.
- `kb/*.pdf` — five past MECO proposals (electrical, bridge, city services, demolition, MoDOT grant).
  The **knowledge base** for grounding edits in past work; all five share the firm's voice/team/
  conventions, so they're a consistent retrieval corpus.

`docs/TakeHomeExampleProposals.zip` is the original archive; the extracted tree is what to use.

**AI-based PDF parsing is slow (5–10 min for large PDFs).** Cache parse results to disk/DB and
develop against `easy.pdf`, never `hard.pdf`.

## Stretch goals (optional — don't expect to finish)

KB integration (ground edits in the `kb/` corpus) · multi-paragraph chat (one instruction spanning
many paragraphs — much harder) · export edited doc back to PDF · handle the hard fixture gracefully.

## README is graded — required sections

The submission README must contain, and these are high-signal for grading:

1. **Setup & run instructions.**
2. **Design decisions** — PDF representation, agent design, UX, with brief justifications.
3. **What I cut and why** — be specific (called out as one of the highest-signal sections).
4. **Failure modes I worried about** — silent-failure risks; what you'd check before a paying customer.
5. **How I'd evaluate this** — pick one evaluation (name fidelity, edit faithfulness, hallucination
   rate, etc.) and **actually run it against the shipped product; include real numbers.**
6. **What I added beyond the brief and why** (or why you added nothing).
7. **What I'd build next given another 8 hours.**

## Submission

Public GitHub repo with **un-squashed commit history** (they want to see the work evolve) + a live
URL. They may run an unseen fixture against it, so design to generalize beyond `easy.pdf`.
