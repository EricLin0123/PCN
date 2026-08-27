import { all, get } from '../utils/db'

export default defineEventHandler(() => {
  const totals = get<any>(`SELECT
    (SELECT count(*) FROM pcn) AS pcns,
    (SELECT count(*) FROM ti_part) AS tiParts,
    (SELECT count(*) FROM delta_form) AS deltaForms,
    (SELECT count(*) FROM delta_form WHERE pcn_id IS NULL) AS unmatchedForms,
    (SELECT count(*) FROM delta_form_item WHERE parse_status = 'UNRESOLVED') AS unresolvedItems`)

  const risk = all(`SELECT COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') AS label, count(*) AS value
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id GROUP BY 1 ORDER BY value DESC`)
  const statuses = all(`SELECT COALESCE(NULLIF(trim(form_status), ''), 'UNSPECIFIED') AS label, count(*) AS value
    FROM delta_form GROUP BY 1 ORDER BY value DESC`)
  const changeTypes = all(`SELECT ct.name AS label, count(*) AS value
    FROM pcn p JOIN change_type ct ON ct.id = p.change_type_id GROUP BY ct.id ORDER BY value DESC LIMIT 8`)
  const recent = all(`SELECT p.id, p.pcn_number_base, p.title, p.notification_date,
    COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') AS risk,
    (SELECT count(*) FROM pcn_ti_part pp WHERE pp.pcn_id = p.id) AS part_count
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id
    ORDER BY p.notification_date DESC, p.id DESC LIMIT 8`)
  return { totals, risk, statuses, changeTypes, recent }
})
