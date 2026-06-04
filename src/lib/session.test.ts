import { describe, it, expect } from 'vitest'
import { signSession, verifySession } from './session'

const SECRET = 'test-secret'

describe('session sign/verify', () => {
  it('round-trips a userId', () => {
    const token = signSession('user-123', SECRET)
    expect(verifySession(token, SECRET)).toBe('user-123')
  })

  it('rejects a tampered userId', () => {
    const token = signSession('user-123', SECRET)
    const forged = token.replace('user-123', 'user-999')
    expect(verifySession(forged, SECRET)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signSession('user-123', SECRET)
    expect(verifySession(token, 'other-secret')).toBeNull()
  })

  it('rejects empty / malformed tokens', () => {
    expect(verifySession(undefined, SECRET)).toBeNull()
    expect(verifySession(null, SECRET)).toBeNull()
    expect(verifySession('', SECRET)).toBeNull()
    expect(verifySession('no-signature', SECRET)).toBeNull()
  })

  it('preserves a userId containing dots (uses last separator)', () => {
    const token = signSession('a.b.c', SECRET)
    expect(verifySession(token, SECRET)).toBe('a.b.c')
  })
})
