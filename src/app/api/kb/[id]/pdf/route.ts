import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Serves the original (compressed) KB PDF from Postgres, behind login.
// The bytes never live in /public or the repo — only in the DB.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const doc = await db.kbDocument.findUnique({
    where: { id },
    select: { pdfData: true, sourceFilename: true },
  })
  if (!doc?.pdfData) return NextResponse.json({ error: 'No PDF for this document' }, { status: 404 })

  const body = new Uint8Array(doc.pdfData)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.sourceFilename}"`,
      'Content-Length': String(body.byteLength),
      // private: cache in the user's browser only (it's behind auth), not at the edge.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
