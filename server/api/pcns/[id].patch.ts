import { get, run } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!get('SELECT id FROM pcn WHERE id = ?', id)) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const body = await readBody(event)
  const title = String(body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  const risk = body.risk_override || null
  if (risk && !['MAJOR', 'MINOR', 'UNKNOWN'].includes(risk)) throw createError({ statusCode: 400, statusMessage: 'Invalid risk override.' })
  run(`UPDATE pcn SET notification_date = ?, title = ?, change_type_id = ?, risk_override = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    body.notification_date || null, title, body.change_type_id || null, risk, String(body.notes || '').trim(), id)
  return get('SELECT id, updated_at FROM pcn WHERE id = ?', id)
})
