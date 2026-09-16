import { get, run } from '../../../utils/db'
import { assertPcnParts, normalizeRaParts, transaction } from '../../../utils/risk-assessments'

const trackerFilename = '__RA_COVERAGE_TRACKER__'

export default defineEventHandler(async (event) => {
  const pcnId = Number(getRouterParam(event, 'id'))
  const pcn = get<{ pcn_number_base: string }>('SELECT pcn_number_base FROM pcn WHERE id = ?', pcnId)
  if (!pcn) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })

  const body = await readBody(event)
  if (typeof body.acquired !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Acquired must be true or false.' })
  }
  const [partId] = assertPcnParts(pcnId, normalizeRaParts(body.part_number))
  const trackerNumber = `RA-COVERAGE-${pcn.pcn_number_base}`

  return transaction(() => {
    if (body.acquired) {
      const covered = get(`SELECT 1 FROM risk_assessment_ti_part link
        JOIN risk_assessment assessment ON assessment.id = link.risk_assessment_id
        WHERE assessment.pcn_id = ? AND link.ti_part_id = ?`, pcnId, partId)
      if (!covered) {
        run(`INSERT OR IGNORE INTO risk_assessment(ra_number, pcn_id, pcn_number_base, workbook_filename)
          VALUES (?, ?, ?, ?)`, trackerNumber, pcnId, pcn.pcn_number_base, trackerFilename)
        const tracker = get<{ id: number }>(`SELECT id FROM risk_assessment
          WHERE pcn_id = ? AND ra_number = ? AND workbook_filename = ?`, pcnId, trackerNumber, trackerFilename)
        if (!tracker) throw createError({ statusCode: 409, statusMessage: 'Unable to create the RA coverage record.' })
        run('INSERT OR IGNORE INTO risk_assessment_ti_part(risk_assessment_id, ti_part_id) VALUES (?, ?)', tracker.id, partId)
      }
    } else {
      run(`DELETE FROM risk_assessment_ti_part
        WHERE ti_part_id = ? AND risk_assessment_id IN (
          SELECT id FROM risk_assessment WHERE pcn_id = ?
        )`, partId, pcnId)
      run(`DELETE FROM risk_assessment
        WHERE pcn_id = ? AND ra_number = ? AND workbook_filename = ?
          AND NOT EXISTS (
            SELECT 1 FROM risk_assessment_ti_part link WHERE link.risk_assessment_id = risk_assessment.id
          )`, pcnId, trackerNumber, trackerFilename)
    }

    return { part_number: String(body.part_number), acquired: body.acquired }
  })
})
