import { all, get } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const showAll = String(query.pageSize || '').toLowerCase() === 'all'
  const pageSize = showAll ? 10000 : Math.min(100, Math.max(10, Number(query.pageSize) || 25))
  const search = String(query.search || '').trim()
  const risk = String(query.risk || '').trim().toUpperCase()
  const status = String(query.status || '').trim().toUpperCase()
  const uploadState = String(query.uploadState || '').trim().toUpperCase()
  const riskAlignment = String(query.riskAlignment || '').trim().toUpperCase()
  const raState = String(query.raState || '').trim().toUpperCase()
  const changeType = String(query.changeType || '').trim()
  const executiveState = String(query.executiveState || '').trim().toUpperCase()
  const where: string[] = []
  const params: any[] = []
  if (search) {
    where.push(`(p.pcn_number_base LIKE ? OR p.title LIKE ? OR EXISTS (
      SELECT 1 FROM pcn_ti_part pp JOIN ti_part tp ON tp.id = pp.ti_part_id
      WHERE pp.pcn_id = p.id AND tp.normalized_part_number LIKE ?) OR EXISTS (
      SELECT 1 FROM delta_form dfs
      JOIN delta_form_item dfis ON dfis.delta_form_id = dfs.id
      LEFT JOIN delta_part dps ON dps.id = dfis.delta_part_id
      WHERE dfs.pcn_id = p.id
        AND (dfis.ti_part_number_normalized LIKE ? OR dps.normalized_part_number LIKE ?)) OR EXISTS (
      SELECT 1 FROM risk_assessment ra WHERE ra.pcn_id = p.id AND ra.ra_number LIKE ?))`)
    const partSearch = `%${search.toUpperCase()}%`
    params.push(`%${search}%`, `%${search}%`, partSearch, partSearch, partSearch, `%${search}%`)
  }
  if (risk) {
    where.push('ops.expected_risk = ?')
    params.push(risk)
  }
  if (changeType) {
    where.push('ct.name = ?')
    params.push(changeType)
  }
  if (status) {
    where.push('pds.delta_status = ?')
    params.push(status)
  }
  if (uploadState) {
    where.push('ops.upload_state = ?')
    params.push(uploadState)
  }
  if (riskAlignment) {
    where.push('ops.risk_alignment = ?')
    params.push(riskAlignment)
  }
  if (raState) {
    where.push('rac.ra_state = ?')
    params.push(raState)
  }
  if (executiveState) {
    where.push('ex.executive_state = ?')
    params.push(executiveState)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = get<{ count: number }>(`SELECT count(*) AS count FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id JOIN pcn_operational_status ops ON ops.pcn_id = p.id JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id JOIN pcn_executive_status ex ON ex.pcn_id = p.id JOIN pcn_delta_status pds ON pds.pcn_id = p.id ${clause}`, ...params)?.count || 0
  const items = all(`SELECT p.id, p.pcn_number_base, p.notification_date, p.title,
      ct.name AS change_type, ops.expected_risk AS risk,
      (SELECT count(*) FROM pcn_ti_part pp WHERE pp.pcn_id = p.id) AS part_count,
      (SELECT group_concat(affected.display_part_number, '; ')
       FROM (
         SELECT tp2.display_part_number
         FROM pcn_ti_part pp2
         JOIN ti_part tp2 ON tp2.id = pp2.ti_part_id
         WHERE pp2.pcn_id = p.id
         ORDER BY tp2.normalized_part_number
       ) affected) AS ti_affected_parts,
      (SELECT group_concat(received.display_part_number, '; ')
       FROM (
         SELECT tp3.display_part_number
         FROM pcn_ti_part pp3
         JOIN ti_part tp3 ON tp3.id = pp3.ti_part_id
         WHERE pp3.pcn_id = p.id
           AND EXISTS (
             SELECT 1
             FROM delta_form df3
             JOIN delta_form_item dfi3 ON dfi3.delta_form_id = df3.id
             WHERE df3.delta_pcn_number_base = p.pcn_number_base
               AND dfi3.ti_part_number_normalized = tp3.normalized_part_number
               AND dfi3.delta_part_id IS NOT NULL
           )
         ORDER BY tp3.normalized_part_number
       ) received) AS delta_received_parts,
      (SELECT group_concat(missed.display_part_number, '; ')
       FROM (
         SELECT tp4.display_part_number
         FROM pcn_ti_part pp4
         JOIN ti_part tp4 ON tp4.id = pp4.ti_part_id
         WHERE pp4.pcn_id = p.id
           AND EXISTS (
             SELECT 1 FROM delta_form_item mapped_item4
             WHERE mapped_item4.ti_part_number_normalized = tp4.normalized_part_number
               AND mapped_item4.delta_part_id IS NOT NULL
           )
           AND NOT EXISTS (
             SELECT 1
             FROM delta_form df4
             JOIN delta_form_item dfi4 ON dfi4.delta_form_id = df4.id
             WHERE df4.delta_pcn_number_base = p.pcn_number_base
               AND dfi4.ti_part_number_normalized = tp4.normalized_part_number
           )
         ORDER BY tp4.normalized_part_number
       ) missed) AS missed_parts,
      (SELECT count(*) FROM delta_form df WHERE df.pcn_id = p.id) AS form_count,
      (SELECT count(*) FROM risk_assessment ra WHERE ra.pcn_id = p.id) AS ra_count,
      (SELECT group_concat(DISTINCT COALESCE(df.form_status, 'UNSPECIFIED')) FROM delta_form df WHERE df.pcn_id = p.id) AS statuses,
      pds.delta_status,
      ops.total_parts, ops.delta_relevant_parts, ops.uploaded_parts, ops.upload_state, ops.delta_risks, ops.risk_alignment,
      rac.ra_covered_parts, rac.ra_state
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id
    JOIN pcn_operational_status ops ON ops.pcn_id = p.id
    JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id
    JOIN pcn_executive_status ex ON ex.pcn_id = p.id
    JOIN pcn_delta_status pds ON pds.pcn_id = p.id ${clause}
    ORDER BY p.notification_date DESC, p.pcn_number_base DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
  return { items, total, page: showAll ? 1 : page, pageSize, pages: showAll ? 1 : Math.max(1, Math.ceil(total / pageSize)) }
})
