import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { Workspace } from '@/components/Workspace'
import type { Block, LockedField } from '@/lib/parse'

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { id } = await params

  const proposal = await db.proposal.findUnique({ where: { id } })
  if (!proposal) notFound()

  const blocks = (proposal.document ?? []) as unknown as Block[]
  const locked = (proposal.lockedFields ?? []) as unknown as LockedField[]
  const kbDocs = await db.kbDocument.findMany({ select: { id: true, title: true, projectType: true }, orderBy: { createdAt: 'desc' } })
  const attachedKbIds = (proposal.attachedKbIds ?? []) as unknown as string[]

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card/80 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="text-mute transition hover:text-ink">←</Link>
          <span className="truncate font-semibold text-ink">{proposal.title}</span>
        </div>
        <span className="hidden text-xs text-mute sm:block">
          reconstructed from {proposal.sourceFilename}
        </span>
      </header>

      <Workspace proposalId={proposal.id} blocks={blocks} lockedFields={locked} kbDocs={kbDocs} attachedKbIds={attachedKbIds} />
    </main>
  )
}
