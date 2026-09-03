import { get, run } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const pcnId = Number(getRouterParam(event, 'id'))
  if (!get('SELECT id FROM pcn WHERE id = ?', pcnId)) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const body = await readBody(event)
  const documentType = String(body.document_type || '').toUpperCase()
  if (!['RA', 'PPAP'].includes(documentType)) throw createError({ statusCode: 400, statusMessage: 'Document type must be RA or PPAP.' })
  if (body.requested === false) {
    run('DELETE FROM pcn_document_request WHERE pcn_id = ? AND document_type = ?', pcnId, documentType)
  } else {
    run(`INSERT INTO pcn_document_request(pcn_id, document_type) VALUES (?, ?)
      ON CONFLICT(pcn_id, document_type) DO UPDATE SET requested_at = CURRENT_TIMESTAMP`, pcnId, documentType)
  }
  return get('SELECT * FROM pcn_document_status WHERE pcn_id = ?', pcnId)
})
