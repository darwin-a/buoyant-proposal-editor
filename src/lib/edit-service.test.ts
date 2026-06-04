import { describe, it, expect } from 'vitest'
import { MockEditService } from './edit-service'

const svc = new MockEditService()

describe('MockEditService', () => {
  it('replaces a name on a "change X to Y" instruction and reports it', async () => {
    const r = await svc.proposeEdit({
      blockText: 'We served the City of Macon with distinction.',
      instruction: 'change Macon to Dixon',
    })
    expect(r.proposedText).toBe('We served the City of Dixon with distinction.')
    expect(r.changedEntities).toEqual(['Macon→Dixon'])
  })

  it('tightens by removing filler and reports no entity change', async () => {
    const r = await svc.proposeEdit({
      blockText: 'We are really very committed to quite robust outcomes.',
      instruction: 'tighten this',
    })
    expect(r.proposedText).not.toMatch(/\b(really|very|quite)\b/)
    expect(r.changedEntities).toEqual([])
  })

  it('formalizes by expanding contractions, preserving names', async () => {
    const r = await svc.proposeEdit({
      blockText: "We're confident and we can't wait to serve Mayor Wiles.",
      instruction: 'make this more formal',
    })
    expect(r.proposedText).toContain('we are')
    expect(r.proposedText).toContain('cannot')
    expect(r.proposedText).toContain('Mayor Wiles')
    expect(r.changedEntities).toEqual([])
  })

  it('returns a non-empty changed string for a generic instruction', async () => {
    const r = await svc.proposeEdit({ blockText: 'our   team  delivers.', instruction: 'make it cleaner' })
    expect(r.proposedText).toBe('Our team delivers.')
    expect(r.changedEntities).toEqual([])
  })
})
