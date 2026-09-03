import { get, run } from '../../../utils/db'
import { assertAutomotivePcnParts, replacePpapParts } from '../../../utils/ppaps'
import { normalizeRaParts, transaction } from '../../../utils/risk-assessments'

export default defineEventHandler(async (event) => {
  const pcnId = Number(getRouterParam(event, 'id'))
  if (!get('SELECT id FROM pcn WHERE id = ?', pcnId)) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const body = await readBody(event)
  const number = String(body.ppap_number || '').trim()
  if (!number) throw createError({ statusCode: 400, statusMessage: 'PPAP number is required.' })
  const partIds = assertAutomotivePcnParts(pcnId, normalizeRaParts(body.part_numbers))
  try {
    return transaction(() => {
      const result = run('INSERT INTO ppap(ppap_number, pcn_id, filename) VALUES (?, ?, ?)', number, pcnId, String(body.filename || '').trim())
      const id = Number(result.lastInsertRowid)
      replacePpapParts(id, partIds)
      setResponseStatus(event, 201)
      return get('SELECT id, ppap_number, filename FROM ppap WHERE id = ?', id)
    })
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That PPAP number already exists.' })
    throw error
  }
})
