import { get, run } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!get('SELECT id FROM delta_form WHERE id = ?', id)) throw createError({ statusCode: 404, statusMessage: 'Delta form not found' })
  const body = await readBody(event)
  run(`UPDATE delta_form SET form_status = ?, notify = ?, main_change_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    String(body.form_status || '').trim() || null, String(body.notify || '').trim() || null,
    String(body.main_change_reason || '').trim() || null, id)
  return get('SELECT id, form_status, notify, main_change_reason, updated_at FROM delta_form WHERE id = ?', id)
})
