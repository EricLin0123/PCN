import { get, run } from '../../../utils/db'
import { assertPcnParts, normalizeRaParts, replaceRaParts, transaction } from '../../../utils/risk-assessments'

export default defineEventHandler(async (event) => {
  const pcnId = Number(getRouterParam(event, 'id'))
  const pcn = get<{ pcn_number_base: string }>('SELECT pcn_number_base FROM pcn WHERE id = ?', pcnId)
  if (!pcn) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const body = await readBody(event)
  const number = String(body.ra_number || '').trim()
  if (!number) throw createError({ statusCode: 400, statusMessage: 'RA number is required.' })
  const partIds = assertPcnParts(pcnId, normalizeRaParts(body.part_numbers))
  try {
    return transaction(() => {
      const result = run(`INSERT INTO risk_assessment(ra_number, pcn_id, pcn_number_base, workbook_filename)
        VALUES (?, ?, ?, ?)`, number, pcnId, pcn.pcn_number_base, String(body.workbook_filename || '').trim())
      const id = Number(result.lastInsertRowid)
      replaceRaParts(id, partIds)
      setResponseStatus(event, 201)
      return get('SELECT id, ra_number, workbook_filename FROM risk_assessment WHERE id = ?', id)
    })
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That RA number already exists.' })
    throw error
  }
})
