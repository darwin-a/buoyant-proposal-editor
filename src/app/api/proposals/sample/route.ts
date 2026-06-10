import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// "Try a sample" — clone a seeded proposal as a fresh, editable copy. Works in every
// environment: no fixture files on disk, no server-side pdfjs. Prefers the Dixon SOQ
// (the easy fixture); falls back to the oldest proposal in the DB.
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const source =
    (await db.proposal.findFirst({ where: { title: { contains: 'Dixon' } }, orderBy: { createdAt: 'asc' } })) ??
    (await db.proposal.findFirst({ orderBy: { createdAt: 'asc' } }))
  if (!source) return NextResponse.json({ error: 'No sample available' }, { status: 404 })

  try {
    const copy = await db.proposal.create({
      data: {
        title: source.title,
        sourceFilename: source.sourceFilename,
        document: source.document as unknown as Prisma.InputJsonValue,
        lockedFields: source.lockedFields as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    })
    return NextResponse.json({ id: copy.id, title: copy.title })
  } catch (err) {
    console.error('sample clone failed', err)
    return NextResponse.json({ error: 'Sample not available' }, { status: 500 })
  }
}
