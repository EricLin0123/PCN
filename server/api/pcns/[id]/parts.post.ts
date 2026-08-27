import { get, run, useDatabase } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const pcnId = Number(getRouterParam(event, 'id'))
  if (!get('SELECT id FROM pcn WHERE id = ?', pcnId)) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const body = await readBody(event)
  const display = String(body.part_number || '').trim()
  const normalized = display.toUpperCase()
  if (!normalized) throw createError({ statusCode: 400, statusMessage: 'Part number is required.' })
  const db = useDatabase()
  db.exec('BEGIN IMMEDIATE')
  try {
    run('INSERT OR IGNORE INTO ti_part(normalized_part_number, display_part_number) VALUES (?, ?)', normalized, display)
    const part = get<{ id: number }>('SELECT id FROM ti_part WHERE normalized_part_number = ?', normalized)!
    run('INSERT OR IGNORE INTO pcn_ti_part(pcn_id, ti_part_id) VALUES (?, ?)', pcnId, part.id)
    db.exec('COMMIT')
    return get('SELECT id, display_part_number, normalized_part_number FROM ti_part WHERE id = ?', part.id)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
})
