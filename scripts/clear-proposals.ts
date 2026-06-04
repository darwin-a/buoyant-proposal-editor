// Dev helper: wipe proposals (+ cascading edits) for a clean demo list.
//   node --env-file=.env --import tsx scripts/clear-proposals.ts
import { db } from '../src/lib/db'

async function main() {
  const n = await db.proposal.deleteMany()
  console.log(`Deleted ${n.count} proposals`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
