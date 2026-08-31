import { all, get } from '../../utils/db'
import { createSession, isAuthEnabled, verifyPassword } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  if (!isAuthEnabled(event)) return { user: { id: null, username: 'Development user', role: 'admin' }, authEnabled: false }
  const body = await readBody(event)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (!username || !password) throw createError({ statusCode: 400, statusMessage: 'Username and password are required.' })
  if (!all('SELECT id FROM app_user LIMIT 1').length) {
    throw createError({ statusCode: 503, statusMessage: 'No accounts are configured. Set the PCN admin environment variables and restart.' })
  }
  const user = get<any>('SELECT id, username, role, password_hash, password_salt FROM app_user WHERE username = ? AND enabled = 1', username)
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password.' })
  }
  createSession(event, user.id)
  return { user: { id: user.id, username: user.username, role: user.role }, authEnabled: true }
})
