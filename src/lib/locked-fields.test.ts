import { describe, it, expect } from 'vitest'
import { findLockedViolations, analyzeLockedChange } from './locked-fields'
import type { LockedField } from './parse'

const locked: LockedField[] = [
  { label: 'Client', value: 'City of Dixon' },
  { label: 'Project No.', value: '041-560' },
  { label: 'Date', value: 'April 14, 2025' },
]

describe('findLockedViolations', () => {
  it('flags a locked value silently dropped by an edit', () => {
    const v = findLockedViolations('We serve the City of Dixon (041-560).', 'We serve the city (041-560).', locked, [])
    expect(v.map((f) => f.value)).toEqual(['City of Dixon'])
  })

  it('does NOT flag a value the edit explicitly changed', () => {
    const v = findLockedViolations('We serve the City of Dixon.', 'We serve the City of Macon.', locked, ['City of Dixon→City of Macon'])
    expect(v).toEqual([])
  })

  it('does NOT flag preserved values', () => {
    const v = findLockedViolations('City of Dixon, 041-560, April 14, 2025', 'City of Dixon — 041-560 — April 14, 2025', locked, [])
    expect(v).toEqual([])
  })

  it('ignores locked values not present in the original text', () => {
    const v = findLockedViolations('Some unrelated paragraph.', 'Some other paragraph.', locked, [])
    expect(v).toEqual([])
  })

  it('flags multiple silent drops', () => {
    const v = findLockedViolations('City of Dixon, 041-560', 'the city', locked, [])
    expect(v.map((f) => f.value).sort()).toEqual(['041-560', 'City of Dixon'])
  })
})

describe('analyzeLockedChange', () => {
  it('marks an asked-for change to a locked fact as intentional (not collateral)', () => {
    const r = analyzeLockedChange('We serve the City of Dixon.', 'We serve the City of Walia.', locked, ['Dixon→Walia'])
    expect(r.intentional.map((f) => f.value)).toEqual(['City of Dixon'])
    expect(r.collateral).toEqual([])
  })
  it('marks an un-asked drop as collateral', () => {
    const r = analyzeLockedChange('City of Dixon (041-560)', 'the city (041-560)', locked, [])
    expect(r.collateral.map((f) => f.value)).toEqual(['City of Dixon'])
    expect(r.intentional).toEqual([])
  })
})
