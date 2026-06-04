# Design — Mock AI (token-free `EditService`)

**Date:** 2026-06-03
**Status:** In design
**Parent:** `2026-06-03-pdf-edit-loop-design.md`
**Purpose:** Drive the *entire* edit loop convincingly **before** wiring the real proxy.
Deterministic, no token, no network. Swapped 1:1 for `ProxyEditService` later behind the
same interface — the UI never changes.

Why mock first: the loop (select → instruct → diff → apply → compose → undo → review) can
be built, demoed, and tested with zero dependence on the proxy/token. Determinism also
makes demos reliable and the loop unit-testable.

---

## Contract

```ts
proposeEdit({ blockText, instruction, blockType }) → {
  proposedText: string      // the suggested replacement; diff renders proposedText vs blockText
  rationale: string         // one line: what it did + what it preserved (the trust signal)
  changedEntities?: string[]// names/numbers it intentionally changed (feeds faithfulness guard + eval)
}
```

Same inputs → same output, always.

## How the mock decides (intent → transform)

Rule-based intent detection on the instruction string:

1. **Replace / fix a name** — matches `change X to Y`, `X to Y`, `it's Y not X`,
   `the client is Y`, `fix … Y`. → literal string replace in the block.
   *rationale:* "Replaced 'X' → 'Y' (n occurrences). Nothing else changed."
2. **Tighten / shorten / concise** — strip filler (`really, very, quite, just, that,
   in order to`→`to`), collapse redundant clauses, trim whitespace.
   *rationale:* "Tightened ~N%. Kept the claims; no names or numbers changed."
3. **More formal / formalize** — canned substitutions (expand contractions; "… and
   Selection Committee," → "… and Members of the Selection Committee,").
4. **Stronger / rewrite / our voice** — light paraphrase / canned per-block rewrite.
5. **Add from past work** (the KB-flavored intent) — keyword → canned firm snippet:
   `bridge`→NEMO RPC · `electric`→Monroe City · `water`→Macon WTP · `demolition`→
   Hannibal · `grant/MoDOT`→Palmyra. Inserts one sentence.
   *rationale:* "Added a sentence grounded in the [project] work. No existing text changed."
6. **Fallback** — light normalization + mark as rephrased so the diff is non-trivial.

**Faithfulness rule (always):** the mock never changes a name/number unless the
instruction explicitly asks; it reports `changedEntities` so the editor's faithfulness
guard and the eval can verify. `ProxyEditService` gets the same guarantee later via
prompt design + output validation.

## Worked examples (real Dixon content — also the test fixtures)

**A · Tighten** — block: OUR FIRM
- *before:* "MECO Engineering is celebrating its 40th anniversary this year. This
  long-spanning career has been built on serving municipalities, such as yours, in a
  vast span of projects with varying needs, requirements, funding, and challenges. We
  take pride in gaining the majority of our business from repeat, satisfied customers."
- *instruction:* "tighten this"
- *after:* "MECO Engineering is celebrating its 40th anniversary. We've served
  municipalities like yours across projects of every scope, funding, and challenge —
  earning most of our business from repeat, satisfied customers."
- *rationale:* "Tightened ~35%. Kept the 40th-anniversary claim and 'MECO'; no names or
  numbers changed." · *changedEntities:* []

**B · Fix client name** (recycling a past proposal that still says "Macon")
- *before:* "MECO Engineering Company, Inc. (MECO) is pleased to present qualifications
  to the City of Macon, MO for professional engineering services."
- *instruction:* "the client is Dixon, not Macon"
- *after:* "… to the City of Dixon, MO for professional engineering services."
- *rationale:* "Replaced 'Macon' → 'Dixon' (1 occurrence). Nothing else changed."
  · *changedEntities:* ["Macon→Dixon"]

**C · More formal** — block: salutation
- *before:* "Dear Mayor Wiles and Selection Committee,"
- *instruction:* "make this more formal"
- *after:* "Dear Mayor Wiles and Members of the Selection Committee,"
- *rationale:* "Formalized the salutation; preserved 'Mayor Wiles'." · *changedEntities:* []

**D · Add from past work** — block: RELEVANT EXPERIENCE intro
- *before:* "MECO has the honor of serving as the City Engineer/On-Call Engineer for
  several municipalities. Some of these include:"
- *instruction:* "add a sentence about our bridge experience"
- *after:* "… Some of these include: … MECO has also delivered bridge engineering across
  the region, including inspection and replacement design for multiple structures through
  the Northeast Missouri Regional Planning Commission."
- *rationale:* "Added one sentence grounded in the NEMO RPC bridge work. No existing text
  changed." · *changedEntities:* []

**E · Make stronger** — block: closing claim
- *before:* "We take pride in gaining the majority of our business from repeat,
  satisfied customers."
- *instruction:* "make this stronger"
- *after:* "Most of our business comes from repeat, satisfied customers — the clearest
  proof of the service we deliver."
- *rationale:* "Strengthened the claim; preserved meaning, added no facts." · *changedEntities:* []

## Notes

- These examples are the seed **fixtures** for the loop's tests and for the eval
  (name/entity fidelity = `changedEntities` should be empty unless the instruction asked).
- Mock covers manual edits implicitly: manual edits don't call the mock at all — the user
  just types. The mock is only for the ✨ Ask AI path.
