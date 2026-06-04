import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) {
    return NextResponse.json({ error: 'No account for that email' }, { status: 401 })
  }
  await setSession(user.id)
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
}
