import { requireUser } from '../../utils/auth'
import { generateDeltaExecutiveProgressEmail } from '../../utils/deltaExecutiveProgressEmail'

export default defineEventHandler((event) => {
  requireUser(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return generateDeltaExecutiveProgressEmail()
})
