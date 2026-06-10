import type { Prisma } from '@prisma/client'
import { db } from './db'
import type { ParsedDoc } from './doc'

// Persist an already-parsed document. NO pdfjs import — this is what the upload route
// uses (parsing happens in the browser), so the route stays pdfjs-free on the server.
export async function createProposalFromParsed(parsed: ParsedDoc, filename: string, userId: string) {
  return db.proposal.create({
    data: {
      title: parsed.title,
      sourceFilename: filename,
      document: parsed.blocks as unknown as Prisma.InputJsonValue,
      lockedFields: parsed.lockedFields as unknown as Prisma.InputJsonValue,
      createdById: userId,
    },
  })
}
