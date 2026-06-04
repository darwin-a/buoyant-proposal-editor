import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Persist the edited document (Block[]).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const { document } = await req.json().catch(() => ({}))
  if (!Array.isArray(document)) {
    return NextResponse.json({ error: 'document (Block[]) is required' }, { status: 400 })
  }

  try {
    await db.proposal.update({
      where: { id },
      data: { document: document as unknown as Prisma.InputJsonValue },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }
}
