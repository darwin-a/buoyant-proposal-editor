// Seed the knowledge base from the firm's past proposals (kb/ corpus).
//   node --env-file=.env --import tsx scripts/seed-kb.ts
import { readFile } from 'node:fs/promises'
import type { Prisma } from '@prisma/client'
import { db } from '../src/lib/db'
import { parsePdf } from '../src/lib/parse'
import { chunkBlocks } from '../src/lib/kb-chunk'
import { embed } from '../src/lib/embeddings'

const KB = [
  { file: 'monroe_city_electrical_soq.pdf', type: 'Electrical' },
  { file: 'nemo_rpc_bridge_soq.pdf', type: 'Bridge' },
  { file: 'macon_city_soq.pdf', type: 'City services' },
  { file: 'hannibal_demolition_soq.pdf', type: 'Demolition' },
  { file: 'palmyra_modot_tap_soq.pdf', type: 'MoDOT grant' },
]

async function main() {
  await db.kbDocument.deleteMany()
  for (const { file, type } of KB) {
    const data = new Uint8Array(await readFile(`docs/ExampleProposals/kb/${file}`))
    const parsed = await parsePdf(data, file)
    // Compressed copy (gs ebook quality, ~2MB) for the in-app PDF reader; falls
    // back to the original if the compressed cache isn't present.
    const pdf = await readFile(`docs/ExampleProposals/kb/_compressed/${file}`).catch(() =>
      readFile(`docs/ExampleProposals/kb/${file}`),
    )
    const doc = await db.kbDocument.create({
      data: {
        title: parsed.title,
        sourceFilename: file,
        projectType: type,
        document: parsed.blocks as unknown as Prisma.InputJsonValue,
        pdfData: pdf,
      },
    })
    const chunks = chunkBlocks(parsed.blocks)
    const vectors = chunks.length ? await embed(chunks.map((c) => c.text)) : []
    if (chunks.length)
      await db.kbChunk.createMany({
        data: chunks.map((c, i) => ({
          kbDocumentId: doc.id,
          heading: c.heading,
          text: c.text,
          ordinal: c.ordinal,
          embedding: vectors[i] as unknown as Prisma.InputJsonValue,
        })),
      })
    console.log(`kb: ${parsed.title}  (${type}, ${(pdf.length / 1e6).toFixed(1)}MB pdf, ${chunks.length} chunks)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
