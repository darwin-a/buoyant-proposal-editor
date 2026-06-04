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

        {proposals.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-mute">Recent proposals</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
              {proposals.map((p) => (
                <li key={p.id}>
                  <Link href={`/proposals/${p.id}`} className="flex items-center justify-between px-4 py-3 transition hover:bg-canvas">
                    <span className="text-sm font-medium text-ink">{p.title}</span>
                    <span className="text-xs text-mute">
                      {p.createdBy.name} · {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}
