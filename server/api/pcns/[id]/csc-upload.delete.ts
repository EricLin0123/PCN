import { run } from '../../../utils/db'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const result = run('DELETE FROM pcn_csc_upload WHERE pcn_id = ?', id)
  if (!result.changes) throw createError({ statusCode: 404, statusMessage: 'CSC upload record not found.' })
  setResponseStatus(event, 204)
  return null
})
