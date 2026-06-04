import { createHmac, timingSafeEqual } from 'node:crypto'

// Demo-grade signed session: `userId.HMAC(userId)`. No password — email-match login
// against seeded users. The HMAC stops a client from forging a session for another user.
export function signSession(userId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(userId).digest('base64url')
  return `${userId}.${sig}`
}

export function verifySession(token: string | undefined | null, secret: string): string | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(userId).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? userId : null
}
