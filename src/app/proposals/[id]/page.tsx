import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
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
    <main className="min-h-screen bg-white text-gray-900">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-900">←</Link>
          <span className="font-semibold">{proposal.title}</span>
        </div>
        <span className="text-xs text-gray-400">
          reconstructed from {proposal.sourceFilename} · read-only preview (editing next)
        </span>
      </header>

      <div className="mx-auto grid max-w-5xl grid-cols-[1fr_18rem] gap-8 px-6 py-10">
        {/* document */}
        <article className="min-w-0">
          {blocks.length === 0 && <p className="text-sm text-gray-400">No editable text found.</p>}
          {blocks.map((b) =>
            b.type === 'heading' ? (
              <h2 key={b.id} className={`mt-6 font-semibold ${b.level === 1 ? 'text-2xl' : 'text-lg'}`}>
                {b.text}
              </h2>
            ) : (
              <p key={b.id} className="mt-3 text-[15px] leading-relaxed text-gray-800">
                {b.text}
              </p>
            )
          )}
        </article>

        {/* locked-fields rail */}
        <aside className="text-sm">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Locked facts ({locked.length})
          </h3>
          <p className="mb-3 text-xs text-gray-400">Detected automatically. Edits that change these will warn.</p>
          <ul className="space-y-1.5">
            {locked.map((f, i) => (
              <li key={i} className="rounded border border-gray-200 px-2.5 py-1.5">
                <span className="block text-[10px] uppercase tracking-wide text-gray-400">{f.label}</span>
                <span className="text-gray-900">🔒 {f.value}</span>
              </li>
            ))}
            {locked.length === 0 && <li className="text-xs text-gray-400">None detected.</li>}
          </ul>
        </aside>
      </div>
    </main>
  )
}
