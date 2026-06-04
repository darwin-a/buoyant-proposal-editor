import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { Block } from '@/lib/parse'

export default async function KbDocPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { id } = await params

  const doc = await db.kbDocument.findUnique({ where: { id } })
  if (!doc) notFound()
  const blocks = (doc.document ?? []) as unknown as Block[]

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card/80 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/kb" className="text-mute transition hover:text-ink">←</Link>
          <span className="truncate font-semibold text-ink">{doc.title}</span>
          {doc.projectType && (
            <span className="shrink-0 rounded bg-periwinkle-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-navy">
              {doc.projectType}
            </span>
          )}
        </div>
        <span className="hidden text-xs text-mute sm:block">knowledge base · read-only</span>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <article className="doc-editor rounded-2xl border border-line bg-card px-10 py-12 shadow-sm">
          {blocks.map((b) =>
            b.type === 'heading' ? (
              <h2 key={b.id} className={b.level === 1 ? 'text-2xl' : ''}>{b.text}</h2>
            ) : (
              <p key={b.id}>{b.text}</p>
            ),
          )}
        </article>
      </div>
    </main>
  )
}
