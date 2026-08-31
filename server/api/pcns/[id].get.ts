import { all, get } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const pcn = get<any>(`SELECT p.id, p.pcn_number_base, p.notification_date, p.title, p.change_type_id,
      ct.name AS change_type, ct.default_risk, p.risk_override,
      ops.expected_risk,
      p.notes, p.created_at, p.updated_at, ops.total_parts, ops.delta_relevant_parts, ops.uploaded_parts,
      ops.upload_state, ops.delta_risks, ops.risk_alignment
    FROM pcn p LEFT JOIN change_type ct ON ct.id = p.change_type_id
    JOIN pcn_operational_status ops ON ops.pcn_id = p.id WHERE p.id = ?`, id)
  if (!pcn) throw createError({ statusCode: 404, statusMessage: 'PCN not found' })
  const parts = all(`SELECT tp.id, tp.display_part_number, tp.normalized_part_number,
      sbe1.name AS sbe1_name, sbe1.champion_email,
      EXISTS (
        SELECT 1
        FROM delta_form_item mapped_item
        WHERE mapped_item.ti_part_number_normalized = tp.normalized_part_number
          AND mapped_item.delta_part_id IS NOT NULL
      ) AS has_delta_part,
      (SELECT group_concat(mapping.display_part_number, ', ')
       FROM (
         SELECT DISTINCT dp.display_part_number, dp.normalized_part_number
         FROM delta_form_item mapped_item
         JOIN delta_part dp ON dp.id = mapped_item.delta_part_id
         WHERE mapped_item.ti_part_number_normalized = tp.normalized_part_number
         ORDER BY dp.normalized_part_number
       ) mapping) AS delta_part_numbers,
      EXISTS (
        SELECT 1
        FROM delta_form df
        JOIN delta_form_item dfi ON dfi.delta_form_id = df.id
        WHERE df.delta_pcn_number_base = p.pcn_number_base
          AND dfi.ti_part_number_normalized = tp.normalized_part_number
          AND dfi.delta_part_id IS NOT NULL
      ) AS is_on_delta,
      EXISTS (
        SELECT 1
        FROM risk_assessment ra
        JOIN risk_assessment_ti_part rp ON rp.risk_assessment_id = ra.id
        WHERE ra.pcn_id = p.id AND rp.ti_part_id = tp.id
      ) AS has_ra
    FROM pcn_ti_part pp
    JOIN pcn p ON p.id = pp.pcn_id
    JOIN ti_part tp ON tp.id = pp.ti_part_id
    LEFT JOIN ti_part_sbe1 assignment ON assignment.ti_part_id = tp.id
    LEFT JOIN sbe1 ON sbe1.id = assignment.sbe1_id
    WHERE pp.pcn_id = ? ORDER BY tp.normalized_part_number`, id)
  const forms = all<any>(`SELECT df.* FROM delta_form df WHERE df.pcn_id = ? ORDER BY df.apply_date DESC, df.id DESC`, id)
  for (const form of forms) {
    form.items = all(`SELECT dfi.id, dfi.sequence_number, dp.display_part_number AS delta_part,
      dfi.ti_part_number, dfi.raw_line, dfi.parse_status
      FROM delta_form_item dfi LEFT JOIN delta_part dp ON dp.id = dfi.delta_part_id
      WHERE dfi.delta_form_id = ? ORDER BY dfi.sequence_number, dfi.id`, form.id)
  }
  const riskAssessments = all<any>(`SELECT ra.id, ra.ra_number, ra.pcn_number_base, ra.workbook_filename,
    ra.created_at, ra.updated_at FROM risk_assessment ra WHERE ra.pcn_id = ?
    ORDER BY CASE WHEN ra.ra_number GLOB '[0-9]*' THEN CAST(ra.ra_number AS INTEGER) END, ra.ra_number`, id)
  for (const assessment of riskAssessments) {
    assessment.parts = all(`SELECT tp.id, tp.display_part_number, tp.normalized_part_number
      FROM risk_assessment_ti_part rp JOIN ti_part tp ON tp.id = rp.ti_part_id
      WHERE rp.risk_assessment_id = ? ORDER BY tp.normalized_part_number`, assessment.id)
  }
  return { pcn, parts, riskAssessments, forms }
})
