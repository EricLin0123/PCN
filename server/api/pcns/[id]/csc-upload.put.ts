import { get, run } from '../../../utils/db'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const pcn = get<any>(`SELECT p.id, p.pcn_number_base, ops.upload_state
    FROM pcn p JOIN pcn_operational_status ops ON ops.pcn_id = p.id WHERE p.id = ?`, id)
  if (!pcn) throw createError({ statusCode: 404, statusMessage: 'PCN not found.' })
  const existing = get<any>('SELECT confirmed_at FROM pcn_csc_upload WHERE pcn_id = ?', id)
  if (existing?.confirmed_at) throw createError({ statusCode: 409, statusMessage: 'Revoke admin confirmation before changing the CSC upload details.' })
  if (!existing && pcn.upload_state === 'ALL_UPLOADED') {
    throw createError({ statusCode: 409, statusMessage: 'This PCN is already fully represented in imported Delta data.' })
  }

  const body = await readBody(event)
  const applyDate = String(body.apply_date || '').trim()
  const formNo = String(body.form_no || '').trim().toUpperCase()
  const pcnNo = String(body.pcn_no || '').trim().toUpperCase()
  const parsedApplyDate = new Date(`${applyDate}T00:00:00Z`)
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(applyDate) || Number.isNaN(parsedApplyDate.valueOf()) || parsedApplyDate.toISOString().slice(0, 10) !== applyDate) {
    throw createError({ statusCode: 400, statusMessage: 'A valid apply date is required.' })
  }
  if (!formNo || formNo.length > 100) throw createError({ statusCode: 400, statusMessage: 'FORM_NO is required.' })
  if (!new RegExp(`^${pcn.pcn_number_base}\\.[A-Z0-9]+$`, 'i').test(pcnNo)) {
    throw createError({ statusCode: 400, statusMessage: `PCN_NO must include a suffix and begin with ${pcn.pcn_number_base}.` })
  }

  try {
    run(`INSERT INTO pcn_csc_upload(pcn_id, apply_date, form_no, pcn_no, uploaded_by_user_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pcn_id) DO UPDATE SET
        apply_date = excluded.apply_date,
        form_no = excluded.form_no,
        pcn_no = excluded.pcn_no,
        uploaded_by_user_id = excluded.uploaded_by_user_id,
        uploaded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`, id, applyDate, formNo, pcnNo, user.id)
  } catch (error: any) {
    if (String(error.message).includes('UNIQUE')) throw createError({ statusCode: 409, statusMessage: 'That FORM_NO or PCN_NO is already recorded.' })
    throw error
  }
  return get(`SELECT pcn_id, apply_date, form_no, pcn_no, uploaded_at, confirmed_at
    FROM pcn_csc_upload WHERE pcn_id = ?`, id)
})
