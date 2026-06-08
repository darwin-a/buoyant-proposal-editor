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
