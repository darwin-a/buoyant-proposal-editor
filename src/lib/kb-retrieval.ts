import { db } from './db'
import { embed } from './embeddings'

export interface RetrievedChunk {
  kbDocumentId: string
  kbTitle: string
  heading: string | null
  text: string
  score: number
}

export interface Candidate {
  kbDocumentId: string
  kbTitle: string
  heading: string | null
  text: string
  embedding: number[]
}

export const MIN_SCORE = 0.28 // below this, don't ground (tune via scripts/verify-kb.ts)
const COSINE_W = 0.8
const KEYWORD_W = 0.2

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []

// Fraction of the query's distinct words that appear in the text (0..1).
export function keywordOverlap(query: string, text: string): number {
  const q = new Set(words(query))
  if (q.size === 0) return 0
  const t = new Set(words(text))
  let hit = 0
  for (const w of q) if (t.has(w)) hit++
  return hit / q.size
}

export function hybridScore(queryEmb: number[], queryText: string, chunkEmb: number[], chunkText: string): number {
  return COSINE_W * cosine(queryEmb, chunkEmb) + KEYWORD_W * keywordOverlap(queryText, chunkText)
}

// Pure ranker — unit-tested without db/network.
export function rankChunks(queryEmb: number[], queryText: string, candidates: Candidate[], k: number): RetrievedChunk[] {
  return candidates
    .map((c) => ({
      kbDocumentId: c.kbDocumentId,
      kbTitle: c.kbTitle,
      heading: c.heading,
      text: c.text,
      score: hybridScore(queryEmb, queryText, c.embedding, c.text),
    }))
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// Orchestrator: embed the query, load candidate chunks (optionally scoped), rank.
export async function retrieve(query: string, opts: { kbIds?: string[]; k?: number } = {}): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 3
  const where = opts.kbIds && opts.kbIds.length ? { kbDocumentId: { in: opts.kbIds } } : {}
  const rows = await db.kbChunk.findMany({
    where,
    select: { kbDocumentId: true, heading: true, text: true, embedding: true, kbDocument: { select: { title: true } } },
  })
  if (rows.length === 0) return []
  const [queryEmb] = await embed([query])
  const candidates: Candidate[] = rows.map((r) => ({
    kbDocumentId: r.kbDocumentId,
    kbTitle: r.kbDocument.title,
    heading: r.heading,
    text: r.text,
    embedding: r.embedding as unknown as number[],
  }))
  return rankChunks(queryEmb, query, candidates, k)
}
