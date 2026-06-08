import { describe, it, expect } from 'vitest'
import { MockEditService, parseEditResponse } from './edit-service'

const svc = new MockEditService()
const BLOCK = 'MECO Engineering is celebrating its 40th anniversary this year.'

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

describe('parseEditResponse', () => {
  it('parses a clean JSON edit', () => {
    const r = parseEditResponse(
      JSON.stringify({ proposedText: 'MECO marks its 40th milestone this year.', rationale: 'reworded', changedEntities: [] }),
      BLOCK,
    )
    expect(r.proposedText).toBe('MECO marks its 40th milestone this year.')
    expect(r.rationale).toBe('reworded')
    expect(r.clarification).toBeUndefined()
  })

  it('honors an explicit clarification and never proposes prose', () => {
    const r = parseEditResponse(JSON.stringify({ clarification: 'What tone do you want?' }), BLOCK)
    expect(r.clarification).toBe('What tone do you want?')
    expect(r.proposedText).toBe('')
  })

  it('treats conversational, non-JSON prose as a clarification — NOT a proposed edit', () => {
    // the exact failure mode: a vague instruction made the model reply with a question
    const reply = 'The instruction "change this wording a bit" is too vague for me to make a precise edit. Could you clarify?'
    const r = parseEditResponse(reply, BLOCK)
    expect(r.proposedText).toBe('')
    expect(r.clarification).toBeTruthy()
  })

  it('asks for clarification when the edit is identical to the source (a no-op)', () => {
    const r = parseEditResponse(JSON.stringify({ proposedText: BLOCK, rationale: 'no change' }), BLOCK)
    expect(r.proposedText).toBe('')
    expect(r.clarification).toBeTruthy()
  })

  it('asks for clarification when proposedText is empty', () => {
    const r = parseEditResponse(JSON.stringify({ proposedText: '   ', rationale: '' }), BLOCK)
    expect(r.proposedText).toBe('')
    expect(r.clarification).toBeTruthy()
  })

  it('keeps the edit and drops the chatter when the model returns both', () => {
    const r = parseEditResponse(
      JSON.stringify({ proposedText: 'MECO marks 40 years this year.', clarification: 'anything else?', changedEntities: [] }),
      BLOCK,
    )
    expect(r.proposedText).toBe('MECO marks 40 years this year.')
    expect(r.clarification).toBeUndefined()
  })

  it('filters non-string changedEntities', () => {
    const r = parseEditResponse(
      JSON.stringify({ proposedText: 'MECO marks 40 years.', changedEntities: ['a→b', 5, null] }),
      BLOCK,
    )
    expect(r.changedEntities).toEqual(['a→b'])
  })

  it('parses groundedIn when present on a valid edit', () => {
    const r = parseEditResponse(
      JSON.stringify({ proposedText: 'MECO rehabilitated the NEMO bridge.', rationale: 'added', changedEntities: [], groundedIn: ['NEMO Bridge SOQ'] }),
      BLOCK,
    )
    expect(r.groundedIn).toEqual(['NEMO Bridge SOQ'])
  })

  it('omits groundedIn when absent', () => {
    const r = parseEditResponse(JSON.stringify({ proposedText: 'MECO marks 40 years.', rationale: '' }), BLOCK)
    expect(r.groundedIn).toBeUndefined()
  })
})

describe('MockEditService with context', () => {
  it('echoes provided sources into groundedIn', async () => {
    const r = await svc.proposeEdit({
      blockText: 'We serve municipalities.',
      instruction: 'add a sentence about our bridge work',
      context: [{ source: 'NEMO Bridge SOQ', text: 'MECO rehabilitated the NEMO bridge.' }],
    })
    expect(r.groundedIn).toEqual(['NEMO Bridge SOQ'])
  })
})
