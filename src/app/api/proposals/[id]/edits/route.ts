import { NextRequest, NextResponse } from 'next/server'
import { EditKind, type Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Append an applied edit to the log (the edit history / review trail).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { blockId, kind, instruction, before, after, rationale, changedEntities } = body
  if (typeof blockId !== 'string' || typeof before !== 'string' || typeof after !== 'string') {
    return NextResponse.json({ error: 'blockId, before, after are required' }, { status: 400 })
  }

  const edit = await db.edit.create({
    data: {
      proposalId: id,
      blockId,
      authorId: user.id,
      kind: kind === 'ai' ? EditKind.AI : EditKind.MANUAL,
      instruction: typeof instruction === 'string' ? instruction : null,
      before,
      after,
      rationale: typeof rationale === 'string' ? rationale : null,
      changedEntities: (Array.isArray(changedEntities) ? changedEntities : []) as unknown as Prisma.InputJsonValue,
    },
  })
  return NextResponse.json({ id: edit.id })
}
