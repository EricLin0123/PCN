import { get, run } from '../../utils/db'
import { assertAutomotivePcnParts, replacePpapParts } from '../../utils/ppaps'
import { normalizeRaParts, transaction } from '../../utils/risk-assessments'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const document = get<{ pcn_id: number }>('SELECT pcn_id FROM ppap WHERE id = ?', id)
  if (!document) throw createError({ statusCode: 404, statusMessage: 'PPAP not found' })
  const body = await readBody(event)
  const number = String(body.ppap_number || '').trim()
  if (!number) throw createError({ statusCode: 400, statusMessage: 'PPAP number is required.' })
  const partIds = assertAutomotivePcnParts(document.pcn_id, normalizeRaParts(body.part_numbers))
  try {
    return transaction(() => {
      run('UPDATE ppap SET ppap_number = ?, filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', number, String(body.filename || '').trim(), id)
      replacePpapParts(id, partIds)
      return get('SELECT id, ppap_number, filename, updated_at FROM ppap WHERE id = ?', id)
    })
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That PPAP number already exists.' })
    throw error
  }
})
