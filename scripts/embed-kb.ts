// (Re)build the KB retrieval index from existing KbDocument.document rows.
// Does NOT re-parse PDFs. Run: node --env-file=.env --import tsx scripts/embed-kb.ts
import type { Prisma } from '@prisma/client'
import { db } from '../src/lib/db'
import { chunkBlocks } from '../src/lib/kb-chunk'
import { embed } from '../src/lib/embeddings'
import type { Block } from '../src/lib/parse'

async function main() {
  const docs = await db.kbDocument.findMany()
  await db.kbChunk.deleteMany()
  for (const doc of docs) {
    const blocks = (doc.document ?? []) as unknown as Block[]
    const chunks = chunkBlocks(blocks)
    if (chunks.length === 0) {
      console.log(`kb: ${doc.title} — no chunks, skipped`)
      continue
    }
    const vectors = await embed(chunks.map((c) => c.text))
    await db.kbChunk.createMany({
      data: chunks.map((c, i) => ({
        kbDocumentId: doc.id,
        heading: c.heading,
        text: c.text,
        ordinal: c.ordinal,
        embedding: vectors[i] as unknown as Prisma.InputJsonValue,
      })),
    })
    console.log(`kb: ${doc.title} — ${chunks.length} chunks embedded`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
