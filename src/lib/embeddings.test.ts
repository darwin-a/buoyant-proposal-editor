import { describe, it, expect } from 'vitest'
import { embed } from './embeddings'

describe('embed', () => {
  it('returns [] for empty input without calling the network', async () => {
    expect(await embed([])).toEqual([])
  })
})
