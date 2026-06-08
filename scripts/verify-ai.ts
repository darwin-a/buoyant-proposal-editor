// Quick check the real AI service works. Run with the env loaded:
//   node --env-file=.env --import tsx scripts/verify-ai.ts
import { getEditService } from '../src/lib/edit-service'

async function main() {
  const svc = getEditService()
  console.log('EditService in use:', svc.constructor.name) // expect ProxyEditService

  const ANNIV =
    'MECO Engineering is celebrating its 40th anniversary this year. This long-spanning history has been built on serving municipalities, such as yours, in a vast span of projects with varying needs.'

  const tests = [
    { blockText: ANNIV.replace('.', ', serving with really very dedicated staff.'), instruction: 'tighten this' },
    {
      blockText: 'We are pleased to present qualifications to the City of Dixon.',
      instruction: 'change this to the City of Walia', // the natural instruction the mock could not do
    },
    // The exact failure mode: a vague instruction must now return a clarification, NOT garbage.
    { blockText: ANNIV, instruction: 'Lets change this wording a bit' },
    { blockText: ANNIV, instruction: 'make it better' },
  ]

  for (const t of tests) {
    console.log(`\n--- "${t.instruction}" ---`)
    console.log('before :', t.blockText.slice(0, 80) + '…')
    const r = await svc.proposeEdit(t)
    if (r.clarification) {
      console.log('CLARIFY:', r.clarification)
      console.log('(no diff shown, no Apply button — the fix working as intended)')
    } else {
      console.log('after  :', r.proposedText)
      console.log('why    :', r.rationale)
      console.log('changed:', r.changedEntities)
    }
  }
}

main().catch((e) => {
  console.error('\nERROR:', e?.message ?? e)
  process.exit(1)
})
