import { get, run } from '../../../../utils/db'
import { requireAdmin } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!get('SELECT pcn_id FROM pcn_csc_upload WHERE pcn_id = ?', id)) {
    throw createError({ statusCode: 404, statusMessage: 'CSC upload details must be recorded before confirmation.' })
  }
  const body = await readBody(event)
  const confirmed = body.confirmed === true
  run(`UPDATE pcn_csc_upload SET
      confirmed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
      confirmed_by_user_id = CASE WHEN ? THEN ? ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    WHERE pcn_id = ?`, confirmed ? 1 : 0, confirmed ? 1 : 0, user.id, id)
  return get('SELECT pcn_id, confirmed_at FROM pcn_csc_upload WHERE pcn_id = ?', id)
})
