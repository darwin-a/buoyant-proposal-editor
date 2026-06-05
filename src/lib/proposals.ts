import type { Prisma } from '@prisma/client'
import { db } from './db'
import { parsePdf, type ParsedDoc } from './parse'

// Persist an already-parsed document. Used by the upload route, where parsing now
// happens in the browser (so the 18 MB PDF never crosses Vercel's 4.5 MB body limit).
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

// Parse a PDF buffer server-side and persist. Used by seeding and the local sample
// route, which read fixtures from disk (no HTTP body limit applies there).
export async function createProposalFromPdf(data: Uint8Array, filename: string, userId: string) {
  return createProposalFromParsed(await parsePdf(data, filename), filename, userId)
}
