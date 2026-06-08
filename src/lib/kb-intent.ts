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
  /\b(talk|write) about\b/i,
  /\bdescribe\b/i,
  /\bdiscuss\b/i,
  /\bhighlight\b/i,
  /\b(experience|expertise|portfolio|qualifications)\b/i,
]

// True when the instruction explicitly asks to pull in real content from past proposals.
// Used when no KB is attached (search the whole corpus only on a clear request).
export function wantsGrounding(instruction: string): boolean {
  return GROUNDING.some((re) => re.test(instruction))
}

const STYLE_ONLY = [
  /\btighten\b/i,
  /\bshorten\b/i,
  /\bshorter\b/i,
  /\bconcise\b/i,
  /\btrim\b/i,
  /\bcondense\b/i,
  /\bformal\b/i,
  /\bprofessional\b/i,
  /\bpolish\b/i,
  /\btone\b/i,
  /\bgrammar\b/i,
  /\btypo\b/i,
  /\bspelling\b/i,
  /\bpunctuation\b/i,
  /\brephrase\b/i,
  /\breword\b/i,
  /\bsimplify\b/i,
  /\bclarify\b/i,
  /\bchange\b[\s\S]*\bto\b/i,
  /\breplace\b[\s\S]*\bwith\b/i,
]

// True for pure phrasing/formatting edits that need no past content. When a KB is
// attached we ground every OTHER instruction by default; these are the exceptions.
export function isStyleOnlyEdit(instruction: string): boolean {
  return STYLE_ONLY.some((re) => re.test(instruction))
}
