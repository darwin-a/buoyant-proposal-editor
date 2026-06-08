import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { suggestKbForProposal } from '@/lib/kb-suggest'
import type { Block } from '@/lib/parse'

export const runtime = 'nodejs'

// Suggest KB docs to attach, based on the proposal's text. Deterministic.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const proposal = await db.proposal.findUnique({ where: { id }, select: { document: true, attachedKbIds: true } })
  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  const text = ((proposal.document ?? []) as unknown as Block[]).map((b) => b.text).join(' ').slice(0, 5000)
  const attached = (proposal.attachedKbIds ?? []) as unknown as string[]
  const kbDocs = await db.kbDocument.findMany({ select: { id: true, title: true, projectType: true } })
  const suggestions = suggestKbForProposal(text, kbDocs, { exclude: attached }).slice(0, 2)

  return NextResponse.json({ suggestions })
}
