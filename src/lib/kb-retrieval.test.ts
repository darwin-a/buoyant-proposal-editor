import { describe, it, expect } from 'vitest'
import { cosine, keywordOverlap, hybridScore, rankChunks, MIN_SCORE, type Candidate } from './kb-retrieval'

describe('cosine', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('is 0 when a vector is all zeros', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe('keywordOverlap', () => {
  it('is the fraction of distinct query words present in the text', () => {
    expect(keywordOverlap('bridge scour repair', 'we managed scour on the bridge')).toBeCloseTo(2 / 3)
  })
  it('ignores short tokens and is 0 with no overlap', () => {
    expect(keywordOverlap('to of in', 'anything')).toBe(0)
    expect(keywordOverlap('demolition', 'electrical substation')).toBe(0)
  })
})

describe('hybridScore', () => {
  it('weights cosine 0.8 and keyword 0.2', () => {
    const s = hybridScore([1, 0], 'bridge', [1, 0], 'bridge work')
    expect(s).toBeCloseTo(0.8 * 1 + 0.2 * 1)
  })
})

describe('rankChunks', () => {
  const cand = (id: string, emb: number[], text: string): Candidate => ({
    kbDocumentId: id,
    kbTitle: id,
    heading: null,
    text,
    embedding: emb,
  })
  it('returns top-k sorted by score, dropping anything below MIN_SCORE', () => {
    const out = rankChunks([1, 0], 'bridge scour', [cand('match', [1, 0], 'bridge scour protection'), cand('weak', [0, 1], 'unrelated demolition text')], 3)
    expect(out).toHaveLength(1)
    expect(out[0].kbDocumentId).toBe('match')
    expect(out[0].score).toBeGreaterThanOrEqual(MIN_SCORE)
  })
  it('respects k', () => {
    const out = rankChunks([1, 0], 'bridge', [cand('a', [1, 0], 'bridge'), cand('b', [1, 0], 'bridge'), cand('c', [1, 0], 'bridge')], 2)
    expect(out).toHaveLength(2)
  })
})
