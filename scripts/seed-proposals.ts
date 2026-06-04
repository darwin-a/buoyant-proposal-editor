// Dev helper: reset proposals to a few VARIED demo entries (different clients).
//   node --env-file=.env --import tsx scripts/seed-proposals.ts
import { readFile } from 'node:fs/promises'
import { db } from '../src/lib/db'
import { createProposalFromPdf } from '../src/lib/proposals'

// active proposals = ones being edited (the kb/ corpus is the knowledge base, seeded separately)
const FILES = ['docs/ExampleProposals/proposals/easy.pdf']

async function main() {
  await db.proposal.deleteMany()
  const user =
    (await db.user.findUnique({ where: { email: 'darwin@mecoengineering.com' } })) ??
    (await db.user.findFirst())
  if (!user) throw new Error('no users — run pnpm db:seed first')

  for (const f of FILES) {
    const data = new Uint8Array(await readFile(f))
    const p = await createProposalFromPdf(data, f.split('/').pop()!, user.id)
    console.log('created:', p.title)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
