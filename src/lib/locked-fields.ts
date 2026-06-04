import type { LockedField } from './parse'

// A locked value is "violated" when it was present in the original text but is missing
// from the proposed text — UNLESS the edit explicitly intended to change it (it appears
// as the "from" side of a changedEntities "from→to" entry). Pure + deterministic.
export function findLockedViolations(
  before: string,
  after: string,
  lockedFields: LockedField[],
  changedEntities: string[],
): LockedField[] {
  const intentional = new Set(
    changedEntities.flatMap((e) => {
      const from = e.split(/→|->/)[0]?.trim()
      return from ? [from] : []
    }),
  )
  return lockedFields.filter(
    (f) => before.includes(f.value) && !after.includes(f.value) && !intentional.has(f.value),
  )
}
