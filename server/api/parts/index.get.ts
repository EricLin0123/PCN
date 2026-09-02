import { all, get, useDatabase } from '../../utils/db'

function splitValues(value: string | null) {
  return value ? value.split('|').filter(Boolean) : []
}

function ensureNrCache() {
  const db = useDatabase()
  const cacheIsComplete = db.prepare(`SELECT
      (SELECT count(*) FROM part_nr_cache) = (SELECT count(*) FROM ti_part)
      AND NOT EXISTS (
        SELECT 1 FROM ti_part tp
        LEFT JOIN part_nr_cache cache ON cache.ti_part_id = tp.id
        WHERE cache.ti_part_id IS NULL
      ) AS complete`).get() as { complete: number }
  if (cacheIsComplete.complete) return false

  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`DELETE FROM part_nr_cache;
      INSERT INTO part_nr_cache(ti_part_id, net_revenue, rank_desc, rank_asc)
      WITH revenue AS (
        SELECT
          tp.id AS ti_part_id,
          tp.normalized_part_number,
          COALESCE(sum(mmr.net_revenue), 0) AS net_revenue
        FROM ti_part tp
        LEFT JOIN material_month_revenue mmr
          ON mmr.normalized_part_number = tp.normalized_part_number
        GROUP BY tp.id
      )
      SELECT
        ti_part_id,
        net_revenue,
        row_number() OVER (ORDER BY net_revenue DESC, normalized_part_number),
        row_number() OVER (ORDER BY net_revenue ASC, normalized_part_number)
      FROM revenue;
      COMMIT;`)
    return true
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export default defineEventHandler((event) => {
  const nrCacheCalculated = ensureNrCache()
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const showAll = String(query.pageSize || '').toLowerCase() === 'all'
  let pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 50))
  const nrSort = String(query.nrSort || '').toLowerCase()
  const search = String(query.search || '').trim()
  const sbe1 = String(query.sbe1 || '').trim().toUpperCase()
  const source = String(query.source || '').trim().toUpperCase()
  const where: string[] = []
  const params: any[] = []

  if (search) {
    const contains = `%${search}%`
    const normalized = `%${search.toUpperCase()}%`
    where.push(`(tp.normalized_part_number LIKE ? OR sbe.name LIKE ? OR sbe1.name LIKE ? OR sbe2.name LIKE ? OR sbe1.champion_email LIKE ?
      OR EXISTS (
        SELECT 1 FROM pcn_ti_part pp
        JOIN pcn ON pcn.id = pp.pcn_id
        WHERE pp.ti_part_id = tp.id AND pcn.pcn_number_base LIKE ?
      ) OR EXISTS (
        SELECT 1 FROM risk_assessment_ti_part rp
        JOIN risk_assessment ra ON ra.id = rp.risk_assessment_id
        WHERE rp.ti_part_id = tp.id AND ra.ra_number LIKE ?
      ) OR EXISTS (
        SELECT 1 FROM delta_ti_part_mapping mapping
        JOIN delta_part dp ON dp.id = mapping.delta_part_id
        WHERE mapping.ti_part_id = tp.id
          AND dp.normalized_part_number LIKE ?
      ))`)
    params.push(normalized, contains, contains, contains, contains, contains, contains, normalized)
  }
  if (sbe1) {
    where.push('sbe1.name = ?')
    params.push(sbe1)
  }
  if (source === 'AUTHORITATIVE') where.push('assignment.ti_part_id IS NOT NULL AND inference.ti_part_id IS NULL')
  if (source === 'INFERRED') where.push('inference.ti_part_id IS NOT NULL')
  if (source === 'UNASSIGNED') where.push('assignment.ti_part_id IS NULL')
  if (source === 'ASSIGNED') where.push('assignment.ti_part_id IS NOT NULL')

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const joins = `FROM ti_part tp
    JOIN part_nr_cache nr_cache ON nr_cache.ti_part_id = tp.id
    LEFT JOIN ti_part_organization assignment ON assignment.ti_part_id = tp.id
    LEFT JOIN sbe1 ON sbe1.id = assignment.sbe1_id
    LEFT JOIN ti_part_sbe1_inference inference ON inference.ti_part_id = tp.id
    LEFT JOIN sbe ON sbe.id = assignment.sbe_id
    LEFT JOIN sbe2 ON sbe2.id = assignment.sbe2_id`
  const total = get<{ count: number }>(`SELECT count(*) AS count ${joins} ${clause}`, ...params)?.count || 0
  if (showAll) pageSize = Math.max(1, total)
  const items = all<any>(`SELECT
      tp.id,
      tp.display_part_number,
      tp.normalized_part_number,
      tp.industry,
      sbe.name AS sbe_name,
      sbe1.name AS sbe1_name,
      sbe2.name AS sbe2_name,
      sbe1.champion_email,
      CASE
        WHEN inference.ti_part_id IS NOT NULL THEN 'INFERRED'
        WHEN assignment.ti_part_id IS NOT NULL THEN 'AUTHORITATIVE'
        ELSE 'UNASSIGNED'
      END AS ownership_source,
      inference.matched_prefix,
      inference.evidence_count,
      inference.inferred_at,
      (SELECT count(*) FROM pcn_ti_part pp WHERE pp.ti_part_id = tp.id) AS pcn_count,
      (SELECT group_concat(linked.value, '|') FROM (
        SELECT p.id || '^' || p.pcn_number_base AS value
        FROM pcn_ti_part pp
        JOIN pcn p ON p.id = pp.pcn_id
        WHERE pp.ti_part_id = tp.id
        ORDER BY p.notification_date DESC, p.pcn_number_base DESC
      ) linked) AS pcn_links,
      (SELECT count(DISTINCT rp.risk_assessment_id)
       FROM risk_assessment_ti_part rp WHERE rp.ti_part_id = tp.id) AS ra_count,
      (SELECT group_concat(covered.ra_number, ', ') FROM (
        SELECT DISTINCT ra.ra_number
        FROM risk_assessment_ti_part rp
        JOIN risk_assessment ra ON ra.id = rp.risk_assessment_id
        WHERE rp.ti_part_id = tp.id
        ORDER BY CASE WHEN ra.ra_number GLOB '[0-9]*' THEN CAST(ra.ra_number AS INTEGER) END, ra.ra_number
      ) covered) AS ra_numbers,
      (SELECT group_concat(mapped.display_part_number, ', ') FROM (
        SELECT DISTINCT dp.display_part_number, dp.normalized_part_number
        FROM delta_ti_part_mapping mapping
        JOIN delta_part dp ON dp.id = mapping.delta_part_id
        WHERE mapping.ti_part_id = tp.id
        ORDER BY dp.normalized_part_number
      ) mapped) AS delta_part_numbers,
      nr_cache.net_revenue
    ${joins}
    ${clause}
    ORDER BY ${nrSort === 'asc' ? 'nr_cache.rank_asc,' : nrSort === 'desc' ? 'nr_cache.rank_desc,' : ''} tp.normalized_part_number
    LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)

  for (const item of items) {
    item.pcns = splitValues(item.pcn_links).map((value) => {
      const [id, pcnNumber] = value.split('^')
      return { id: Number(id), pcn_number_base: pcnNumber }
    })
    delete item.pcn_links
  }

  const totals = get<any>(`SELECT
      count(*) AS parts,
      count(assignment.ti_part_id) AS assigned,
      count(inference.ti_part_id) AS inferred,
      sum(CASE WHEN assignment.ti_part_id IS NULL THEN 1 ELSE 0 END) AS unassigned
    ${joins}`)
  const sbe1Options = all(`SELECT sbe1.name, count(assignment.ti_part_id) AS part_count
    FROM sbe1
    LEFT JOIN ti_part_organization assignment ON assignment.sbe1_id = sbe1.id
    GROUP BY sbe1.id ORDER BY sbe1.name`)

  return {
    items,
    total,
    page: showAll ? 1 : page,
    pageSize,
    pages: showAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
    totals,
    sbe1Options,
    nrCacheCalculated
  }
})
