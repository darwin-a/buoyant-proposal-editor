import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  const users = await db.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { name: true, email: true, role: true },
  })

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Proposal Editor</h1>
        <p className="mt-1 mb-8 text-sm text-gray-500">Edit your proposals with AI — grounded in your firm’s past work.</p>
        <LoginForm users={users} />
      </div>
    </main>
  )
}
