import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { get, run } from './db'

export type AppRole = 'operator' | 'admin'
export interface AppUser { id: number | null, username: string, role: AppRole }

const cookieName = 'pcn_session'

export function isAuthEnabled(event: H3Event) {
  return Boolean(useRuntimeConfig(event).authEnabled)
}

export function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64)
}

export function verifyPassword(password: string, salt: string, expectedHex: string) {
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = hashPassword(password, salt)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function createSession(event: H3Event, userId: number) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000)
  run('DELETE FROM auth_session WHERE expires_at <= CURRENT_TIMESTAMP')
  run('INSERT INTO auth_session(user_id, token_hash, expires_at) VALUES (?, ?, ?)', userId, tokenHash, expiresAt.toISOString())
  setCookie(event, cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export function clearAuthSession(event: H3Event) {
  const token = getCookie(event, cookieName)
  if (token) run('DELETE FROM auth_session WHERE token_hash = ?', createHash('sha256').update(token).digest('hex'))
  deleteCookie(event, cookieName, { path: '/' })
}

export function currentUser(event: H3Event): AppUser | null {
  if (!isAuthEnabled(event)) return { id: null, username: 'Development user', role: 'admin' }
  const token = getCookie(event, cookieName)
  if (!token) return null
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return get<AppUser>(`SELECT u.id, u.username, u.role
    FROM auth_session s JOIN app_user u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.enabled = 1`, tokenHash) || null
}

export function requireUser(event: H3Event) {
  const user = currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Please sign in.' })
  return user
}

export function requireAdmin(event: H3Event) {
  const user = requireUser(event)
  if (user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Admin permission is required.' })
  return user
}
