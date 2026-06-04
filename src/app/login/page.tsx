import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'
import { BuoyantMark } from '@/components/BuoyantLogo'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  const users = await db.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { name: true, email: true, role: true },
  })

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* buoyant wash */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-periwinkle-soft to-transparent" />
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <div className="animate-fade-up animate-float">
          <BuoyantMark size={44} />
        </div>
        <h1 className="animate-fade-up mt-5 text-2xl font-semibold tracking-tight text-ink" style={{ animationDelay: '60ms' }}>
          Welcome to Buoyant
        </h1>
        <p className="animate-fade-up mt-1.5 mb-8 text-center text-sm text-mute" style={{ animationDelay: '120ms' }}>
          Edit your proposals with AI — grounded in your firm’s past work.
        </p>
        <div className="animate-fade-up w-full" style={{ animationDelay: '180ms' }}>
          <LoginForm users={users} />
        </div>
        <p className="animate-fade-up mt-8 text-center text-xs text-mute" style={{ animationDelay: '260ms' }}>
          Always human-reviewed · Your data stays yours
        </p>
      </div>
    </main>
  )
}
