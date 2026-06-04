import { cookies } from 'next/headers'
import { db } from './db'
import { signSession, verifySession } from './session'

const COOKIE = 'buoyant_session'
const secret = () => process.env.AUTH_SECRET || 'dev-only-insecure-secret'

export async function setSession(userId: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE, signSession(userId, secret()), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function clearSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export async function getCurrentUser() {
  const jar = await cookies()
  const userId = verifySession(jar.get(COOKIE)?.value, secret())
  if (!userId) return null
  return db.user.findUnique({ where: { id: userId } })
}
