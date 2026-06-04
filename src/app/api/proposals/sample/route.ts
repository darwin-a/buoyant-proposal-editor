import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getCurrentUser } from '@/lib/auth'
import { createProposalFromPdf } from '@/lib/proposals'

export const runtime = 'nodejs'
export const maxDuration = 60

// Dev/demo convenience: load the bundled easy.pdf fixture (local only — gitignored).
const SAMPLE = join(process.cwd(), 'docs', 'ExampleProposals', 'proposals', 'easy.pdf')

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  try {
    const data = new Uint8Array(await readFile(SAMPLE))
    const proposal = await createProposalFromPdf(data, 'easy.pdf', user.id)
    return NextResponse.json({ id: proposal.id, title: proposal.title })
  } catch (err) {
    console.error('sample load failed', err)
    return NextResponse.json({ error: 'Sample not available' }, { status: 500 })
  }
}
