// Quick check the real AI service works. Run with the env loaded:
//   node --env-file=.env --import tsx scripts/verify-ai.ts
import { getEditService } from '../src/lib/edit-service'

async function main() {
  const svc = getEditService()
  console.log('EditService in use:', svc.constructor.name) // expect ProxyEditService

  const tests = [
    {
      blockText:
        'MECO Engineering is celebrating its 40th anniversary this year, serving municipalities with really very dedicated staff.',
      instruction: 'tighten this',
    },
    {
      blockText: 'We are pleased to present qualifications to the City of Dixon.',
      instruction: 'change this to the City of Walia', // the natural instruction the mock could not do
    },
  ]

  for (const t of tests) {
    console.log(`\n--- "${t.instruction}" ---`)
    console.log('before :', t.blockText)
    const r = await svc.proposeEdit(t)
    console.log('after  :', r.proposedText)
    console.log('why    :', r.rationale)
    console.log('changed:', r.changedEntities)
  }
}

main().catch((e) => {
  console.error('\nERROR:', e?.message ?? e)
  process.exit(1)
})
