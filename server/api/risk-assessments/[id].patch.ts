import { get, run } from '../../utils/db'
import { assertPcnParts, normalizeRaParts, replaceRaParts, transaction } from '../../utils/risk-assessments'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const assessment = get<{ pcn_id: number }>('SELECT pcn_id FROM risk_assessment WHERE id = ?', id)
  if (!assessment) throw createError({ statusCode: 404, statusMessage: 'Risk assessment not found' })
  const body = await readBody(event)
  const number = String(body.ra_number || '').trim()
  if (!number) throw createError({ statusCode: 400, statusMessage: 'RA number is required.' })
  const partIds = assertPcnParts(assessment.pcn_id, normalizeRaParts(body.part_numbers))
  try {
    return transaction(() => {
      run('UPDATE risk_assessment SET ra_number = ?, workbook_filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        number, String(body.workbook_filename || '').trim(), id)
      replaceRaParts(id, partIds)
      return get('SELECT id, ra_number, workbook_filename, updated_at FROM risk_assessment WHERE id = ?', id)
    })
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That RA number already exists.' })
    throw error
  }
})
