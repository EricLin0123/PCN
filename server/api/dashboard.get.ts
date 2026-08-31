import { all, get } from '../utils/db'

export default defineEventHandler(() => {
  const totals = get<any>(`SELECT
    (SELECT count(*) FROM pcn) AS pcns,
    (SELECT count(*) FROM ti_part) AS tiParts,
    (SELECT count(*) FROM delta_form) AS deltaForms,
    (SELECT count(*) FROM risk_assessment) AS riskAssessments,
    (SELECT count(*) FROM delta_form WHERE pcn_id IS NULL) AS unmatchedForms,
    (SELECT count(*) FROM delta_form_item WHERE parse_status = 'UNRESOLVED') AS unresolvedItems,
    (SELECT count(*) FROM pcn_operational_status WHERE upload_state = 'ALL_UPLOADED') AS allUploaded,
    (SELECT count(*) FROM pcn_operational_status WHERE upload_state = 'PARTLY_UPLOADED') AS partlyUploaded,
    (SELECT count(*) FROM pcn_operational_status WHERE upload_state = 'NOT_UPLOADED') AS notUploaded,
    (SELECT count(*) FROM pcn_operational_status WHERE risk_alignment = 'MISMATCH') AS riskMismatches`)

  const risk = all(`SELECT expected_risk AS label, count(*) AS value
    FROM pcn_expected_risk GROUP BY expected_risk ORDER BY value DESC`)
  const statuses = all(`SELECT COALESCE(NULLIF(trim(form_status), ''), 'UNSPECIFIED') AS label, count(*) AS value
    FROM delta_form GROUP BY 1 ORDER BY value DESC`)
  const uploadStates = all(`SELECT upload_state AS label, count(*) AS value FROM pcn_operational_status GROUP BY upload_state ORDER BY value DESC`)
  const riskAlignment = all(`SELECT risk_alignment AS label, count(*) AS value FROM pcn_operational_status GROUP BY risk_alignment ORDER BY value DESC`)
  const changeTypes = all(`SELECT ct.name AS label, count(*) AS value
    FROM pcn p JOIN change_type ct ON ct.id = p.change_type_id GROUP BY ct.id ORDER BY value DESC LIMIT 8`)
  const recent = all(`SELECT p.id, p.pcn_number_base, p.title, p.notification_date,
    expected.expected_risk AS risk,
    (SELECT count(*) FROM pcn_ti_part pp WHERE pp.pcn_id = p.id) AS part_count
    FROM pcn p JOIN pcn_expected_risk expected ON expected.pcn_id = p.id
    ORDER BY p.notification_date DESC, p.id DESC LIMIT 8`)
  const mismatches = all(`SELECT p.id, p.pcn_number_base, p.title, ops.expected_risk, ops.delta_risks,
      ops.upload_state, ops.uploaded_parts, ops.total_parts, ops.delta_relevant_parts
    FROM pcn_operational_status ops JOIN pcn p ON p.id = ops.pcn_id
    WHERE ops.risk_alignment = 'MISMATCH' ORDER BY p.notification_date DESC LIMIT 8`)
  return { totals, risk, statuses, uploadStates, riskAlignment, changeTypes, recent, mismatches }
})
