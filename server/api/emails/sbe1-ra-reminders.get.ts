import { requireUser } from '../../utils/auth'
import { generateSbe1RaReminderEmails } from '../../utils/sbe1RaReminderEmails'

export default defineEventHandler((event) => {
  requireUser(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return generateSbe1RaReminderEmails()
})
