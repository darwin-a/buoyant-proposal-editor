import type { Prisma } from '@prisma/client'
import { db } from './db'
import { parsePdf } from './parse'

// Parse a PDF buffer into blocks + immutable fields and persist as a Proposal.
export async function createProposalFromPdf(data: Uint8Array, filename: string, userId: string) {
  const parsed = await parsePdf(data, filename)
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
