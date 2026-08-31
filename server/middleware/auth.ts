import { currentUser, isAuthEnabled } from '../utils/auth'

export default defineEventHandler((event) => {
  if (!isAuthEnabled(event) || !event.path.startsWith('/api/')) return
  if (event.path === '/api/auth/login' || event.path === '/api/auth/me' || event.path === '/api/auth/logout') return
  if (!currentUser(event)) throw createError({ statusCode: 401, statusMessage: 'Please sign in.' })
})
