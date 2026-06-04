import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createProposalFromPdf } from '@/lib/proposals'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer())
    const proposal = await createProposalFromPdf(data, file.name, user.id)
    return NextResponse.json({ id: proposal.id, title: proposal.title })
  } catch (err) {
    console.error('parse/create failed', err)
    return NextResponse.json({ error: 'Could not parse that PDF' }, { status: 500 })
  }
}
