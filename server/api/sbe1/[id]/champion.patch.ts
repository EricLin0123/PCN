import { get, run } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || !get('SELECT id FROM sbe1 WHERE id = ?', id)) {
    throw createError({ statusCode: 404, statusMessage: 'SBE-1 not found.' })
  }
  const body = await readBody(event)
  const email = String(body.champion_email || '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid champion email address.' })
  }
  run('UPDATE sbe1 SET champion_email = ? WHERE id = ?', email || null, id)
  return get('SELECT id, name, champion_email FROM sbe1 WHERE id = ?', id)
})
