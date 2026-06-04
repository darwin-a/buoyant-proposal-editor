'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type SeedUser = { name: string; email: string; role: string }

const roleStyle: Record<string, string> = {
  COORDINATOR: 'bg-amber-100 text-amber-800',
  PRINCIPAL: 'bg-periwinkle-soft text-navy',
  ENGINEER: 'bg-slate-100 text-slate-600',
}

export function LoginForm({ users }: { users: SeedUser[] }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function signIn(withEmail: string) {
    setError('')
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: withEmail }),
    })
    setLoading(false)
    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Sign-in failed')
    }
  }

  return (
    <div className="w-full rounded-2xl border border-line bg-card p-6 shadow-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) signIn(email.trim())
        }}
        className="space-y-3"
      >
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-periwinkle focus:bg-card"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full rounded-lg bg-navy px-3 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700 disabled:opacity-40"
        >
          {loading ? 'Signing in…' : 'Continue'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-6">
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-mute">
          Demo accounts — click to sign in
        </p>
        <div className="space-y-1.5">
          {users.map((u) => (
            <button
              key={u.email}
              onClick={() => signIn(u.email)}
              disabled={loading}
              className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-periwinkle hover:bg-canvas disabled:opacity-40"
            >
              <span>
                <span className="font-medium text-ink">{u.name}</span>
                <span className="ml-2 text-mute">{u.email}</span>
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${roleStyle[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                {u.role.toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
