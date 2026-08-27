import { all, get } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 25))
  const search = String(query.search || '').trim()
  const risk = String(query.risk || '').trim().toUpperCase()
  const status = String(query.status || '').trim().toUpperCase()
  const where: string[] = []
  const params: any[] = []
  if (search) {
    where.push(`(p.pcn_number_base LIKE ? OR p.title LIKE ? OR EXISTS (
      SELECT 1 FROM pcn_ti_part pp JOIN ti_part tp ON tp.id = pp.ti_part_id
      WHERE pp.pcn_id = p.id AND tp.normalized_part_number LIKE ?))`)
    params.push(`%${search}%`, `%${search}%`, `%${search.toUpperCase()}%`)
  }
  if (risk) {
    where.push("COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') = ?")
    params.push(risk)
  }
  if (status) {
    where.push(`EXISTS (SELECT 1 FROM delta_form ds WHERE ds.pcn_id = p.id AND UPPER(COALESCE(ds.form_status, 'UNSPECIFIED')) = ?)`)
    params.push(status)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = get<{ count: number }>(`SELECT count(*) AS count FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id ${clause}`, ...params)?.count || 0
  const items = all(`SELECT p.id, p.pcn_number_base, p.notification_date, p.title,
      ct.name AS change_type, COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') AS risk,
      (SELECT count(*) FROM pcn_ti_part pp WHERE pp.pcn_id = p.id) AS part_count,
      (SELECT count(*) FROM delta_form df WHERE df.pcn_id = p.id) AS form_count,
      (SELECT group_concat(DISTINCT COALESCE(df.form_status, 'UNSPECIFIED')) FROM delta_form df WHERE df.pcn_id = p.id) AS statuses
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id ${clause}
    ORDER BY p.notification_date DESC, p.pcn_number_base DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
})
