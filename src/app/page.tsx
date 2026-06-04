import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { LogoutButton } from '@/components/LogoutButton'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Proposal Editor</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            {user.name} · <span className="lowercase">{user.role}</span>
          </span>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className="text-xl font-semibold">Welcome, {user.name.split(' ')[0]}</h1>
        <p className="mt-2 text-sm text-gray-500">
          Upload a proposal PDF to start editing. (Uploader coming next.)
        </p>
      </div>
    </main>
  )
}
