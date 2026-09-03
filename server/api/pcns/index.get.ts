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
  const cscStatus = String(query.cscStatus || '').trim().toUpperCase()
  const riskAlignment = String(query.riskAlignment || '').trim().toUpperCase()
  const raState = String(query.raState || '').trim().toUpperCase()
  const raDocumentState = String(query.raDocumentState || '').trim().toUpperCase()
  const ppapDocumentState = String(query.ppapDocumentState || '').trim().toUpperCase()
  const changeType = String(query.changeType || '').trim()
  const sbe1 = String(query.sbe1 || '').trim()
  const executiveState = String(query.executiveState || '').trim().toUpperCase()
  const requestedRevenueFrom = String(query.revenueFrom || '').trim()
  const requestedRevenueTo = String(query.revenueTo || '').trim()
  const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
  const revenueFrom = validMonth(requestedRevenueFrom) ? requestedRevenueFrom : '2025-08'
  const revenueTo = validMonth(requestedRevenueTo) ? requestedRevenueTo : '2026-09'
  if (revenueFrom > revenueTo) throw createError({ statusCode: 400, statusMessage: 'Revenue start month must not be after end month' })
  const isRevenuePriorityQueue = ['NO_12M_SALES', 'MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA', 'MAJOR_READY_UPLOAD'].includes(executiveState)
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
      SELECT 1 FROM risk_assessment ra WHERE ra.pcn_id = p.id AND ra.ra_number LIKE ?) OR EXISTS (
      SELECT 1 FROM pcn_csc_upload cu_search WHERE cu_search.pcn_id = p.id
        AND (cu_search.form_no LIKE ? OR cu_search.pcn_no LIKE ?)))`)
    const partSearch = `%${search.toUpperCase()}%`
    params.push(`%${search}%`, `%${search}%`, partSearch, partSearch, partSearch, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (risk) {
    where.push('ops.expected_risk = ?')
    params.push(risk)
  }
  if (changeType) {
    where.push('ct.name = ?')
    params.push(changeType)
  }
  if (sbe1) {
    where.push(`EXISTS (SELECT 1 FROM pcn_ti_part sbe1_parts
      WHERE sbe1_parts.pcn_id = p.id AND (
        EXISTS (SELECT 1 FROM ti_part_organization sbe1_mapping WHERE sbe1_mapping.ti_part_id = sbe1_parts.ti_part_id AND sbe1_mapping.sbe1_id = (SELECT id FROM sbe1 WHERE name = ?))
      ))`)
    params.push(sbe1)
  }
  if (status) {
    where.push('pds.delta_status = ?')
    params.push(status)
  }
  if (uploadState) {
    where.push('ops.upload_state = ?')
    params.push(uploadState)
  }
  if (cscStatus === 'CONFIRMED') where.push('cu.confirmed_at IS NOT NULL')
  if (cscStatus === 'CSC_UPLOADED') where.push('cu.pcn_id IS NOT NULL AND cu.confirmed_at IS NULL')
  if (cscStatus === 'NA') where.push("cu.pcn_id IS NULL AND ops.upload_state = 'ALL_UPLOADED'")
  if (cscStatus === 'NOT_UPLOADED') where.push("cu.pcn_id IS NULL AND ops.upload_state <> 'ALL_UPLOADED'")
  if (riskAlignment) {
    where.push('ops.risk_alignment = ?')
    params.push(riskAlignment)
  }
  if (raState) {
    where.push('rac.ra_state = ?')
    params.push(raState)
  }
  if (raDocumentState) { where.push('documents.ra_document_state = ?'); params.push(raDocumentState) }
  if (ppapDocumentState) { where.push('documents.ppap_document_state = ?'); params.push(ppapDocumentState) }
  if (executiveState) {
    where.push('ex.executive_state = ?')
    params.push(executiveState)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = get<{ count: number }>(`SELECT count(*) AS count FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id JOIN pcn_operational_status ops ON ops.pcn_id = p.id JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id JOIN pcn_document_status documents ON documents.pcn_id = p.id JOIN pcn_executive_status ex ON ex.pcn_id = p.id JOIN pcn_delta_status pds ON pds.pcn_id = p.id LEFT JOIN pcn_csc_upload cu ON cu.pcn_id = p.id ${clause}`, ...params)?.count || 0
  const items = all(`SELECT p.id, p.pcn_number_base, p.notification_date, p.title,
      ct.name AS change_type, ops.expected_risk AS risk,
      (SELECT count(*) FROM pcn_ti_part pp WHERE pp.pcn_id = p.id) AS part_count,
      (SELECT group_concat(owners.sbe1_name, '; ')
       FROM (
         SELECT DISTINCT sbe1.name AS sbe1_name
       FROM pcn_ti_part owner_parts
       JOIN ti_part_organization owner_mapping ON owner_mapping.ti_part_id = owner_parts.ti_part_id
       JOIN sbe1 ON sbe1.id = owner_mapping.sbe1_id
       WHERE owner_parts.pcn_id = p.id
         ORDER BY sbe1.name
       ) owners) AS sbe1_names,
      (SELECT group_concat(affected.display_part_number, '; ')
       FROM (
         SELECT tp2.display_part_number
         FROM pcn_ti_part pp2
         JOIN ti_part tp2 ON tp2.id = pp2.ti_part_id
         WHERE pp2.pcn_id = p.id
         ORDER BY tp2.normalized_part_number
       ) affected) AS ti_affected_parts,
      (SELECT group_concat(revenue_part.part_revenue, '; ')
       FROM (
         SELECT tp_revenue.display_part_number || ': ' || printf('%.2f', COALESCE(sum(mmr_part.net_revenue), 0)) AS part_revenue
         FROM pcn_ti_part pp_revenue
         JOIN ti_part tp_revenue ON tp_revenue.id = pp_revenue.ti_part_id
         LEFT JOIN material_month_revenue mmr_part
           ON mmr_part.normalized_part_number = tp_revenue.normalized_part_number
          AND mmr_part.revenue_month BETWEEN ? AND ?
         WHERE pp_revenue.pcn_id = p.id
         GROUP BY tp_revenue.id
         ORDER BY COALESCE(sum(mmr_part.net_revenue), 0) DESC, tp_revenue.normalized_part_number
       ) revenue_part) AS ti_affected_parts_with_revenue,
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
             JOIN delta_ti_part_mapping mapping3 ON mapping3.delta_part_id = dfi3.delta_part_id
             WHERE df3.delta_pcn_number_base = p.pcn_number_base
               AND mapping3.ti_part_id = tp3.id
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
             SELECT 1 FROM delta_ti_part_mapping mapped_item4
             WHERE mapped_item4.ti_part_id = tp4.id
           )
           AND NOT EXISTS (
             SELECT 1
             FROM delta_form df4
             JOIN delta_form_item dfi4 ON dfi4.delta_form_id = df4.id
             JOIN delta_ti_part_mapping mapping4 ON mapping4.delta_part_id = dfi4.delta_part_id
             WHERE df4.delta_pcn_number_base = p.pcn_number_base
               AND mapping4.ti_part_id = tp4.id
           )
         ORDER BY tp4.normalized_part_number
       ) missed) AS missed_parts,
      (SELECT count(*) FROM delta_form df WHERE df.pcn_id = p.id) AS form_count,
      (SELECT count(*) FROM risk_assessment ra WHERE ra.pcn_id = p.id) AS ra_count,
      (SELECT group_concat(DISTINCT COALESCE(df.form_status, 'UNSPECIFIED')) FROM delta_form df WHERE df.pcn_id = p.id) AS statuses,
      pds.delta_status,
      CASE
        WHEN cu.confirmed_at IS NOT NULL THEN 'CONFIRMED'
        WHEN cu.pcn_id IS NOT NULL THEN 'CSC_UPLOADED'
        WHEN ops.upload_state = 'ALL_UPLOADED' THEN 'NA'
        ELSE 'NOT_UPLOADED'
      END AS csc_status,
      cu.apply_date AS csc_apply_date, cu.form_no AS csc_form_no, cu.pcn_no AS csc_pcn_no,
      ops.total_parts, ops.delta_relevant_parts, ops.uploaded_parts, ops.upload_state, ops.delta_risks, ops.risk_alignment,
      rac.ra_covered_parts, rac.ra_state,
      documents.ra_required_parts, documents.ra_covered_parts AS document_ra_covered_parts, documents.ra_document_state,
      documents.ppap_required_parts, documents.ppap_covered_parts, documents.ppap_document_state,
      COALESCE((
        SELECT sum(mmr.net_revenue)
        FROM pcn_ti_part revenue_pp
        JOIN ti_part revenue_tp ON revenue_tp.id = revenue_pp.ti_part_id
        JOIN material_month_revenue mmr ON mmr.normalized_part_number = revenue_tp.normalized_part_number
        WHERE revenue_pp.pcn_id = p.id AND mmr.revenue_month BETWEEN ? AND ?
      ), 0) AS net_revenue
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id
    JOIN pcn_operational_status ops ON ops.pcn_id = p.id
    JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id
    JOIN pcn_document_status documents ON documents.pcn_id = p.id
    JOIN pcn_executive_status ex ON ex.pcn_id = p.id
    JOIN pcn_delta_status pds ON pds.pcn_id = p.id
    LEFT JOIN pcn_csc_upload cu ON cu.pcn_id = p.id ${clause}
    ORDER BY ${isRevenuePriorityQueue ? 'net_revenue DESC,' : ''} p.notification_date DESC, p.pcn_number_base DESC LIMIT ? OFFSET ?`, revenueFrom, revenueTo, revenueFrom, revenueTo, ...params, pageSize, (page - 1) * pageSize)
  const sbe1Options = all<{ name: string }>('SELECT name FROM sbe1 ORDER BY name').map(item => item.name)
  return { items, total, page: showAll ? 1 : page, pageSize, pages: showAll ? 1 : Math.max(1, Math.ceil(total / pageSize)), revenueFrom, revenueTo, isRevenuePriorityQueue, sbe1Options }
})
