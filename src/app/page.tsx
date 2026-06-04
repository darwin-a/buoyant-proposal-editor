import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LogoutButton } from '@/components/LogoutButton'
import { Uploader } from '@/components/Uploader'
import { BuoyantLogo } from '@/components/BuoyantLogo'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Everyone in the firm sees all proposals (access decision).
  const proposals = await db.proposal.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
    take: 20,
  })

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line bg-card/70 px-6 py-3 backdrop-blur">
        <BuoyantLogo />
        <div className="flex items-center gap-3 text-sm">
          <span className="text-mute">
            {user.name} · <span className="lowercase">{user.role}</span>
          </span>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="flex flex-col items-center">
          <h1 className="text-xl font-semibold text-ink">Edit a proposal</h1>
          <p className="mt-1 mb-8 text-sm text-mute">Upload a PDF to recover its structure and start editing.</p>
          <Uploader />
        </div>

        <div className="mt-16">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-mute">Recent proposals</h2>
          {proposals.length > 0 ? (
            <ul className="grid gap-2">
              {proposals.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/proposals/${p.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition hover:border-periwinkle hover:shadow-sm"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-periwinkle-soft text-navy">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                      <span className="block truncate text-xs text-mute">
                        {p.createdBy.name} · {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="text-mute transition group-hover:translate-x-0.5 group-hover:text-periwinkle">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-line py-10 text-center">
              <p className="text-sm text-mute">No proposals yet — upload one above to get started.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
