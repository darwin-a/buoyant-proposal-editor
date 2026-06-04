# Design — Document / Editor View

**Date:** 2026-06-03
**Status:** In design (living doc — expect heavy iteration)
**Parent:** `2026-06-03-pdf-edit-loop-design.md`
**Scope:** The screen *after* upload — where the parsed proposal appears and the
inline edit loop happens. This is the product's heart and the graded core (R4–R7,
G1–G4). Entry/upload screen and parsing internals are specified elsewhere.

Grounded throughout in the real `easy.pdf` (City of Dixon SOQ): client "City of
Dixon," Mayor "Mary Wiles," firm "MECO," sections OUR FIRM / SERVICES / RELEVANT
EXPERIENCE / YOUR TEAM / OUR APPROACH.

---

## 1. Layout — document-centric + collapsible activity rail

The proposal is the page, rendered as clean typed blocks; editing is **inline**. A
**collapsible right rail** holds what collaboration needs a home for (edit log /
activity / review), staying minimal until there are edits.

```
┌─────────────────────────────────────────────────────────────────┐
│ Statement of Qualifications — City of Dixon     [↶ Undo] [Share] │ header
│ reconstructed from easy.pdf · view original ↗                    │ trust anchor
├──────────────────────────────────────────────┬──────────────────┤
│  Dear Mayor Wiles and Selection Committee,    │  Activity         │ right rail
│                                              │                   │ (edit log +
│  ┌────────────────────────────────────────┐  │  nothing yet —    │  collab home;
│  │ OUR FIRM                          ✎     │  │  your edits and   │  collapsed
│  │ MECO Engineering is celebrating its    │  │  teammates'       │  until used)
│  │ 40th anniversary this year …           │  │  reviews show here│
│  └────────────────────────────────────────┘  │                   │
│  MECO currently has seven office locations…   │                   │
└──────────────────────────────────────────────┴──────────────────┘
```

**Decision:** keep the rail, collapsed/minimal until edits exist — it's where
collaboration lives (edit log, "Don requested: tighten this," approve/reject). A
document-only view is cleaner for the single-player demo but leaves collaboration
homeless. *(Open: default collapsed vs. open — see §7.)*

## 2. The trust moment

When the doc appears it must read as *their* proposal. Trust comes from three cheap
signals:
1. **Correct content + structure** — real headings, paragraphs, lists; title
   "Statement of Qualifications — City of Dixon."
2. **`view original ↗`** — opens the actual PDF in a new tab. We have the file; costs
   nothing, strong trust anchor, no split-pane to build.
3. **Honesty label** — "reconstructed from easy.pdf" sets the expectation that this is
   the *editable* version, not a pixel copy (which the brief blesses, C6).

## 3. The edit interaction (inline)

Select a block → it opens in place with **just a free-text box**. Very basic for now
— no quick-action chips (deferred; see §7). Type the instruction in plain language.

```
┌────────────────────────────────────────┐
│ OUR FIRM                                │
│ MECO Engineering is celebrating its     │
│ 40th anniversary this year …            │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ Tell the AI what to change…         │ │   ← plain language
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

Then the proposal returns as an **inline word-level diff** + a one-line **rationale**:

```
│ MECO Engineering is celebrating its 40th anniversary this year.
│ ~~This long-spanning career has been built on~~ ⁺⁺For four decades
│ we've⁺⁺ served municipalities such as yours …
│ ───────────────────────────────────────────────
│ ⓘ Tightened. Kept the 40-year claim, "MECO," and the client name.
│                                  [Reject]   [Apply ✓]
```

Deliberate touches (chips deferred — see §7; starting basic):
- **Rationale line** — tells the user *what changed and what was preserved*; the
  trust/faithfulness signal (how they know "Dixon" / a license number wasn't quietly
  altered). Ties to the name-fidelity eval.
- **Apply / Reject in place** — nothing changes until they decide; Apply swaps text,
  logs to the rail; the proposal composes edit by edit.

## 4. Block lifecycle (states)

`idle → hover → selected(editing) → proposing → diff → applied`
plus collaboration: `pending-review` (a teammate proposed; awaits approval).

- **idle** — rendered block.
- **hover** — lifts/highlights; reveals the ✎ "edit with AI" affordance.
- **selected** — chips + instruction input (§3).
- **proposing** — awaiting AI (streaming if available; see Perf).
- **diff** — inline diff + rationale + Apply/Reject.
- **applied** — text swapped; logged.
- **pending-review** — proposed by a collaborator; shows in-block + in rail with
  Approve/Reject (collaboration phase).

## 5. Composition + undo

Each apply mutates exactly one block, so edits compose naturally. **Undo** reverses the
last apply (header control). In the loop-only phase undo is a client stack; with
collaboration it reads from the persisted, authored edit log (§6 of parent).

## 6. Collaboration surface (in the editor)

Lives in the right rail + light in-block cues:
- **Edit log / activity** — chronological "You tightened OUR FIRM," "Don approved …"
- **Edit requests** — a reviewer leaves a plain-language ask on a block ("tighten
  this") without doing it; drafter or AI fulfills.
- **Review/approve** — pending proposed edits get Approve / Reject; the trail records
  who/what/when (sign-off culture).
- No live presence/cursors (cut).

## 7. Open questions / forks (to discuss)

- [ ] Right rail default: collapsed vs. open on load?
- [ ] Quick-action chips: **deferred** — starting basic with just a free-text box.
      Revisit later which 3–4 intents to add (Tighten / Fix a name / Our voice / Formal).
- [ ] Rationale line: always shown, or on-hover/expand?
- [ ] Faithfulness guard: if a proposed edit changes a name/number not mentioned in the
      instruction, warn inline? (Strong trust touch; ties to eval.)
- [ ] Lists & records (SERVICES, team bios): editable as one block, or item-level?
- [ ] Selection affordance: whole-block click vs. an explicit ✎ button?
- [ ] Multiple blocks selected / multi-paragraph instruction — in scope here or later?
- [ ] Keyboard: select-next, apply (⌘↵), reject (esc), undo (⌘Z)?
- [ ] Insert a *new* block ("add a paragraph about our bridge work" → KB) — where does
      the affordance live (between blocks)?
- [ ] Empty/error/parse-failed states for the document view.

## Requirements touched

R4 (render interactively) · R5 (select + instruct) · R6 (proposed change + decide) ·
R7 (compose + undo) · G1 (UX details) · G2 (perceived speed) · G3 (taste) · G4 (polish).
