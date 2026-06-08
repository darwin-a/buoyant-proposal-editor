import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Persist the edited document (Block[]) and/or the attached KB ids.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: Prisma.ProposalUpdateInput = {}
  if (Array.isArray(body.document)) data.document = body.document as unknown as Prisma.InputJsonValue
  if (Array.isArray(body.attachedKbIds)) data.attachedKbIds = body.attachedKbIds as unknown as Prisma.InputJsonValue
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'document (Block[]) or attachedKbIds is required' }, { status: 400 })
  }

  try {
    await db.proposal.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }
}
