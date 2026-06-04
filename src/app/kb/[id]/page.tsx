import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export default async function KbDocPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { id } = await params

  // metadata only — the PDF bytes are streamed separately by /api/kb/[id]/pdf
  const doc = await db.kbDocument.findUnique({
    where: { id },
    select: { id: true, title: true, projectType: true },
  })
  if (!doc) notFound()

  return (
    <main className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-card/80 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/kb" className="text-mute transition hover:text-ink">←</Link>
          <span className="truncate font-semibold text-ink">{doc.title}</span>
          {doc.projectType && (
            <span className="shrink-0 rounded bg-periwinkle-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-navy">
              {doc.projectType}
            </span>
          )}
        </div>
        <a
          href={`/api/kb/${doc.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-xs text-mute transition hover:text-ink sm:block"
        >
          open in new tab ↗
        </a>
      </header>

      <iframe
        src={`/api/kb/${doc.id}/pdf`}
        title={doc.title}
        className="min-h-0 w-full flex-1 bg-canvas"
      />
    </main>
  )
}
