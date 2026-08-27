import { run, get } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const number = String(body.pcn_number_base || '').trim()
  if (!/^20\d{9}$/.test(number)) throw createError({ statusCode: 400, statusMessage: 'PCN number must be an 11-digit number beginning with 20.' })
  const title = String(body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  try {
    const result = run(`INSERT INTO pcn(pcn_number_base, notification_date, title, change_type_id, risk_override, notes)
      VALUES (?, ?, ?, ?, ?, ?)`, number, body.notification_date || null, title, body.change_type_id || null,
      body.risk_override || null, String(body.notes || '').trim())
    setResponseStatus(event, 201)
    return get('SELECT id, pcn_number_base FROM pcn WHERE id = ?', Number(result.lastInsertRowid))
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That PCN already exists.' })
    throw error
  }
})
