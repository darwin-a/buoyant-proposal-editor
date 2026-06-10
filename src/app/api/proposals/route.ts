import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createProposalFromParsed } from '@/lib/proposals'
import { validateParsedDoc } from '@/lib/doc'

export const runtime = 'nodejs'

// The browser parses the PDF and POSTs the resulting blocks as JSON (a few KB), so the
// raw PDF bytes never reach the server — sidestepping Vercel's 4.5 MB request-body limit.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const filename = typeof body?.filename === 'string' ? body.filename : 'upload.pdf'
  const parsed = validateParsedDoc(body?.parsed)
  if (!parsed) {
    return NextResponse.json({ error: 'Could not read any text from that PDF' }, { status: 400 })
  }

  try {
    const proposal = await createProposalFromParsed(parsed, filename, user.id)
    return NextResponse.json({ id: proposal.id, title: proposal.title })
  } catch (err) {
    console.error('proposal create failed', err)
    return NextResponse.json({ error: 'Could not save that proposal' }, { status: 500 })
  }
}
