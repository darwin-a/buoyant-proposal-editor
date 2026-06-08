import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getEditService, type EditContext } from '@/lib/edit-service'
import { wantsGrounding } from '@/lib/kb-intent'
import { retrieve, buildRetrievalQuery } from '@/lib/kb-retrieval'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Propose an AI edit for one block. Grounds in the KB when the instruction asks for it.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { blockText, instruction, proposalId } = await req.json().catch(() => ({}))
  if (typeof blockText !== 'string' || typeof instruction !== 'string' || !instruction.trim()) {
    return NextResponse.json({ error: 'blockText and instruction are required' }, { status: 400 })
  }

  let context: EditContext[] | undefined
  let sources: { id: string; title: string }[] | undefined
  if (wantsGrounding(instruction)) {
    let kbIds: string[] | undefined
    if (typeof proposalId === 'string') {
      const p = await db.proposal.findUnique({ where: { id: proposalId }, select: { attachedKbIds: true } })
      const ids = (p?.attachedKbIds ?? []) as unknown as string[]
      if (Array.isArray(ids) && ids.length) kbIds = ids
    }
    try {
      const hits = await retrieve(buildRetrievalQuery(instruction, blockText), { kbIds })
      if (hits.length) {
        context = hits.map((h) => ({ source: h.kbTitle, heading: h.heading ?? undefined, text: h.text }))
        // unique source docs, so the UI can link each citation to its PDF reader
        sources = Array.from(new Map(hits.map((h) => [h.kbDocumentId, { id: h.kbDocumentId, title: h.kbTitle }])).values())
      }
    } catch (err) {
      console.error('kb retrieve failed — proceeding ungrounded', err) // grounding is additive
    }
  }

  const result = await getEditService().proposeEdit({ blockText, instruction, context })
  return NextResponse.json({ ...result, sources })
}
