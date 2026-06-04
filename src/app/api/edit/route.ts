import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getEditService } from '@/lib/edit-service'

export const runtime = 'nodejs'

// Propose an AI edit for one block. Stateless — the apply/log step persists it.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { blockText, instruction } = await req.json().catch(() => ({}))
  if (typeof blockText !== 'string' || typeof instruction !== 'string' || !instruction.trim()) {
    return NextResponse.json({ error: 'blockText and instruction are required' }, { status: 400 })
  }

  const result = await getEditService().proposeEdit({ blockText, instruction })
  return NextResponse.json(result)
}
