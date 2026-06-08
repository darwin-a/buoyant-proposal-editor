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
