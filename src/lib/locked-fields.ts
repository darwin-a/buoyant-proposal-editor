import type { LockedField } from './parse'

const froms = (changedEntities: string[]): string[] =>
  changedEntities.map((e) => e.split(/→|->/)[0]?.trim()).filter((x): x is string => !!x)

// Classify which locked facts an edit touches:
//  - intentional: the edit explicitly asked to change it (it's a changedEntities "from")
//  - collateral:  it was dropped/altered WITHOUT being asked → the real risk
export function analyzeLockedChange(
  before: string,
  after: string,
  lockedFields: LockedField[],
  changedEntities: string[],
): { intentional: LockedField[]; collateral: LockedField[] } {
  const fr = froms(changedEntities)
  const isIntentional = (v: string) => fr.some((f) => f.includes(v) || v.includes(f))
  const dropped = lockedFields.filter((f) => before.includes(f.value) && !after.includes(f.value))
  return {
    intentional: dropped.filter((f) => isIntentional(f.value)),
    collateral: dropped.filter((f) => !isIntentional(f.value)),
  }
}

// The unexpected ones — used by the eval and the hard warning.
export function findLockedViolations(
  before: string,
  after: string,
  lockedFields: LockedField[],
  changedEntities: string[],
): LockedField[] {
  return analyzeLockedChange(before, after, lockedFields, changedEntities).collateral
}
