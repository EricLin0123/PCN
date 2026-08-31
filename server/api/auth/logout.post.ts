import { clearAuthSession, isAuthEnabled } from '../../utils/auth'

export default defineEventHandler((event) => {
  if (isAuthEnabled(event)) clearAuthSession(event)
  return { ok: true }
})
