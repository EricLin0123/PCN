import { get, run } from '../../utils/db'
import { transaction } from '../../utils/risk-assessments'

function normalizeParts(value: unknown) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,;\r\n]+/)
  const parts = source.map((value) => {
    const display = String(value || '').trim().toUpperCase()
    return { display, normalized: display.replace(/[^A-Z0-9]/g, '') }
  }).filter(part => part.normalized)
  return [...new Map(parts.map(part => [part.normalized, part])).values()]
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const number = String(body.pcn_number_base || '').trim()
  if (!/^20\d{9}$/.test(number)) throw createError({ statusCode: 400, statusMessage: 'PCN number must be an 11-digit number beginning with 20.' })
  const title = String(body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  const notificationDate = String(body.notification_date || '').trim()
  if (!isValidDate(notificationDate)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid notification date is required.' })
  }
  const changeTypeId = Number(body.change_type_id)
  if (!Number.isInteger(changeTypeId) || !get('SELECT id FROM change_type WHERE id = ?', changeTypeId)) {
    throw createError({ statusCode: 400, statusMessage: 'Select a valid change type.' })
  }
  const risk = String(body.risk_override || '').trim() || null
  if (risk && !['MAJOR', 'MINOR', 'UNKNOWN'].includes(risk)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid risk override.' })
  }
  const parts = normalizeParts(body.part_numbers)
  if (!parts.length) throw createError({ statusCode: 400, statusMessage: 'At least one affected TI part is required.' })
  try {
    const created = transaction(() => {
      const result = run(`INSERT INTO pcn(pcn_number_base, notification_date, title, change_type_id, risk_override, notes)
        VALUES (?, ?, ?, ?, ?, ?)`, number, notificationDate, title, changeTypeId, risk, String(body.notes || '').trim())
      const pcnId = Number(result.lastInsertRowid)
      for (const part of parts) {
        run('INSERT OR IGNORE INTO ti_part(normalized_part_number, display_part_number) VALUES (?, ?)', part.normalized, part.display)
        const tiPart = get<{ id: number }>('SELECT id FROM ti_part WHERE normalized_part_number = ?', part.normalized)
        if (!tiPart) throw new Error(`Unable to save TI part ${part.display}.`)
        run('INSERT INTO pcn_ti_part(pcn_id, ti_part_id) VALUES (?, ?)', pcnId, tiPart.id)
      }
      return get('SELECT id, pcn_number_base FROM pcn WHERE id = ?', pcnId)
    })
    setResponseStatus(event, 201)
    return created
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That PCN already exists.' })
    throw error
  }
})
