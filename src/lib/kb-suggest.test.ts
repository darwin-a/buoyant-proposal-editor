import { describe, it, expect } from 'vitest'
import { suggestKbForProposal, type KbDocLike } from './kb-suggest'

const docs: KbDocLike[] = [
  { id: 'bridge', title: 'NEMO RPC Bridge SOQ', projectType: 'Bridge' },
  { id: 'demo', title: 'Hannibal Demolition SOQ', projectType: 'Demolition' },
]

describe('suggestKbForProposal', () => {
  it('ranks the matching project type first', () => {
    const out = suggestKbForProposal('We propose bridge rehabilitation and scour repair for the county.', docs)
    expect(out[0].id).toBe('bridge')
    expect(out[0].why).toMatch(/bridge/i)
  })
  it('excludes already-attached docs', () => {
    const out = suggestKbForProposal('bridge work', docs, { exclude: ['bridge'] })
    expect(out.find((s) => s.id === 'bridge')).toBeUndefined()
  })
  it('omits docs with zero overlap', () => {
    const out = suggestKbForProposal('electrical substation design', docs)
    expect(out.find((s) => s.id === 'demo')).toBeUndefined()
  })
})
