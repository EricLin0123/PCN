import { all, get } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const pcn = get<any>(`SELECT p.id, p.pcn_number_base, p.notification_date, p.title, p.change_type_id,
      ct.name AS change_type, ct.default_risk, p.risk_override,
      COALESCE(p.risk_override, ct.default_risk, 'UNKNOWN') AS expected_risk,
      p.notes, p.created_at, p.updated_at
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id WHERE p.id = ?`, id)
  if (!pcn) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const parts = all(`SELECT tp.id, tp.display_part_number, tp.normalized_part_number
    FROM pcn_ti_part pp JOIN ti_part tp ON tp.id = pp.ti_part_id
    WHERE pp.pcn_id = ? ORDER BY tp.normalized_part_number`, id)
  const forms = all<any>(`SELECT df.* FROM delta_form df WHERE df.pcn_id = ? ORDER BY df.apply_date DESC, df.id DESC`, id)
  for (const form of forms) {
    form.items = all(`SELECT dfi.id, dfi.sequence_number, dp.display_part_number AS delta_part,
      dfi.ti_part_number, dfi.raw_line, dfi.parse_status
      FROM delta_form_item dfi LEFT JOIN delta_part dp ON dp.id = dfi.delta_part_id
      WHERE dfi.delta_form_id = ? ORDER BY dfi.sequence_number, dfi.id`, form.id)
  }
  return { pcn, parts, forms }
})
