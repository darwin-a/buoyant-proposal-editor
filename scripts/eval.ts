// Name/entity fidelity eval (README §5). Runs "preserve-everything" edits over the
// blocks that contain locked facts and checks each fact survives. Real numbers.
//   pnpm eval            (uses getEditService — Mock unless BUOYANT_PROXY_TOKEN is set)
import { readFileSync } from 'node:fs'
import { parsePdf } from '../src/lib/parse'
import { getEditService } from '../src/lib/edit-service'
import { findLockedViolations } from '../src/lib/locked-fields'

const PDF = process.argv[2] ?? 'docs/ExampleProposals/proposals/easy.pdf'
// instructions that should NEVER change a protected fact
const INSTRUCTIONS = ['tighten this', 'rewrite in our voice', 'make this more formal', 'make it more compelling']

async function main() {
  const data = new Uint8Array(readFileSync(PDF))
  const { blocks, lockedFields } = await parsePdf(data, PDF.split('/').pop() ?? 'doc.pdf')
  const svc = getEditService()

  // test set: prose blocks that contain at least one locked fact
  const targets = blocks.filter((b) => b.type === 'paragraph' && lockedFields.some((f) => b.text.includes(f.value)))

  let edits = 0
  let checks = 0
  let preserved = 0
  const failures: { instruction: string; lost: string; block: string }[] = []

  for (const block of targets) {
    const present = lockedFields.filter((f) => block.text.includes(f.value))
    for (const instruction of INSTRUCTIONS) {
      const { proposedText, changedEntities } = await svc.proposeEdit({ blockText: block.text, instruction })
      const violations = findLockedViolations(block.text, proposedText, present, changedEntities)
      edits++
      checks += present.length
      preserved += present.length - violations.length
      for (const v of violations) failures.push({ instruction, lost: v.value, block: block.text.slice(0, 48) })
    }
  }

  const fidelity = checks ? ((preserved / checks) * 100).toFixed(1) : '100.0'
  console.log(`\n=== Name/Entity Fidelity — ${svc.constructor.name} ===`)
  console.log(`PDF:           ${PDF}`)
  console.log(`Edits run:     ${edits}  (${INSTRUCTIONS.length} instructions × ${targets.length} fact-bearing blocks)`)
  console.log(`Entity checks: ${checks}`)
  console.log(`Preserved:     ${preserved}`)
  console.log(`Fidelity:      ${fidelity}%`)
  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`)
    for (const f of failures) console.log(`  [${f.instruction}] lost "${f.lost}"  in  "${f.block}…"`)
  } else {
    console.log(`\nNo failures — every locked fact preserved across all edits.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
