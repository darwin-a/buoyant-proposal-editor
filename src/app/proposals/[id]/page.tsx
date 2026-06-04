import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { Editor } from '@/components/Editor'
import type { Block, LockedField } from '@/lib/parse'

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { id } = await params

  const proposal = await db.proposal.findUnique({ where: { id } })
  if (!proposal) notFound()

  const blocks = (proposal.document ?? []) as unknown as Block[]
  const locked = (proposal.lockedFields ?? []) as unknown as LockedField[]

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/80 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-900">←</Link>
          <span className="truncate font-semibold">{proposal.title}</span>
        </div>
        <span className="hidden text-xs text-gray-400 sm:block">
          reconstructed from {proposal.sourceFilename}
        </span>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_16rem] gap-8 px-6 py-10">
        {/* document sheet */}
        <div className="rounded-xl border border-gray-200 bg-white px-10 py-12 shadow-sm">
          {blocks.length === 0 ? (
            <p className="text-sm text-gray-400">No editable text found.</p>
          ) : (
            <Editor proposalId={proposal.id} blocks={blocks} />
          )}
        </div>

        {/* locked-fields rail */}
        <aside className="sticky top-24 self-start">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Locked facts</span>
            <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">{locked.length}</span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-gray-400">
            Detected automatically. Edits that change these will warn before they’re saved.
          </p>
          <ul className="space-y-1.5">
            {locked.map((f, i) => (
              <li key={i} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                <span className="block text-[10px] uppercase tracking-wide text-gray-400">{f.label}</span>
                <span className="flex items-center gap-1 text-sm text-gray-900">
                  <span className="text-gray-300">🔒</span> {f.value}
                </span>
              </li>
            ))}
            {locked.length === 0 && <li className="text-xs text-gray-400">None detected.</li>}
          </ul>
        </aside>
      </div>
    </main>
  )
}
