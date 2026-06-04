'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type SeedUser = { name: string; email: string; role: string }

const roleStyle: Record<string, string> = {
  COORDINATOR: 'bg-amber-100 text-amber-800',
  PRINCIPAL: 'bg-emerald-100 text-emerald-800',
  ENGINEER: 'bg-sky-100 text-sky-800',
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
    <div className="w-full max-w-sm">
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? 'Signing in…' : 'Continue'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-8">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
          Demo accounts — click to sign in
        </p>
        <div className="space-y-1.5">
          {users.map((u) => (
            <button
              key={u.email}
              onClick={() => signIn(u.email)}
              disabled={loading}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-gray-400 disabled:opacity-40"
            >
              <span>
                <span className="font-medium text-gray-900">{u.name}</span>
                <span className="ml-2 text-gray-400">{u.email}</span>
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${roleStyle[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {u.role.toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
