import { parsePdf } from './parse'
import { createProposalFromParsed } from './proposals'

// Parse a PDF buffer server-side and persist. Imports pdfjs, so this is kept OUT of the
// upload route (which must stay pdfjs-free on Vercel). Used only where a fixture is read
// from disk in Node with @napi-rs/canvas available: seeding and the local sample route.
export async function createProposalFromPdf(data: Uint8Array, filename: string, userId: string) {
  return createProposalFromParsed(await parsePdf(data, filename), filename, userId)
}
