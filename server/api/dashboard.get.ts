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
  return { totals, risk, statuses, uploadStates, riskAlignment, changeTypes }
})
