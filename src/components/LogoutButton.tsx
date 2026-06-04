'use client'

import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        router.push('/login')
        router.refresh()
      }}
      className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-500"
    >
      Sign out
    </button>
  )
}
