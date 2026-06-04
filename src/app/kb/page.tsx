import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LogoutButton } from '@/components/LogoutButton'
import { BuoyantLogo } from '@/components/BuoyantLogo'

export default async function KbPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const docs = await db.kbDocument.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line bg-card/70 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link href="/">
            <BuoyantLogo />
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-mute transition hover:text-ink">Proposals</Link>
            <Link href="/kb" className="font-medium text-ink">Knowledge base</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-mute">
            {user.name} · <span className="lowercase">{user.role}</span>
          </span>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-semibold text-ink">Knowledge base</h1>
        <p className="mt-1 mb-8 text-sm text-mute">
          Your firm’s past proposals. Edits to new proposals can be grounded in this work — same voice,
          team, and conventions.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/kb/${d.id}`}
                className="group flex h-full flex-col rounded-xl border border-line bg-card p-4 transition hover:border-periwinkle hover:shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-periwinkle-soft text-navy">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </span>
                  <span className="rounded bg-periwinkle-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-navy">
                    {d.projectType}
                  </span>
                </div>
                <span className="text-sm font-medium text-ink">{d.title}</span>
                <span className="mt-1 truncate text-xs text-mute">{d.sourceFilename}</span>
                <span className="mt-3 text-xs font-medium text-mute transition group-hover:text-periwinkle">
                  Read PDF →
                </span>
              </Link>
            </li>
          ))}
          {docs.length === 0 && <li className="text-sm text-mute">No knowledge base documents yet.</li>}
        </ul>
      </div>
    </main>
  )
}
