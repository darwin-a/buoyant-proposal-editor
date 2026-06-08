// Verify KB retrieval + grounded edit against the real proxy.
//   node --env-file=.env --import tsx scripts/verify-kb.ts
import { retrieve, buildRetrievalQuery } from '../src/lib/kb-retrieval'
import { wantsGrounding } from '../src/lib/kb-intent'
import { getEditService } from '../src/lib/edit-service'
import { db } from '../src/lib/db'

async function run(label: string, instruction: string, blockText: string, kbIds?: string[]) {
  console.log(`\n=== ${label} ===`)
  console.log('wantsGrounding:', wantsGrounding(instruction))
  const hits = await retrieve(buildRetrievalQuery(instruction, blockText), { kbIds })
  console.log(`retrieved ${hits.length} chunk(s):`)
  for (const h of hits) console.log(`  [${h.score.toFixed(3)}] ${h.kbTitle} — ${(h.heading ?? '').slice(0, 36)}: ${h.text.slice(0, 70).replace(/\n/g, ' ')}…`)

  const context = hits.map((h) => ({ source: h.kbTitle, heading: h.heading ?? undefined, text: h.text }))
  const r = await getEditService().proposeEdit({ blockText, instruction, context })
  console.log('after   :', r.proposedText.slice(0, 220) || '(empty)')
  if (r.clarification) console.log('clarify :', r.clarification)
  console.log('grounded:', r.groundedIn ?? [])
}

async function main() {
  const block = 'MECO Engineering serves municipalities across northeast Missouri.'
  const instruction = 'add a sentence about our bridge rehabilitation experience'

  // Scoped — the money path: attach the Bridge doc, retrieval only sees bridge chunks.
  const bridge = await db.kbDocument.findFirst({ where: { projectType: 'Bridge' }, select: { id: true, title: true } })
  console.log('bridge doc:', bridge?.title)

  await run('UNSCOPED (whole KB)', instruction, block)
  if (bridge) await run('SCOPED to Bridge doc', instruction, block, [bridge.id])
}

main()
  .catch((e) => {
    console.error('ERROR:', e?.message ?? e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
