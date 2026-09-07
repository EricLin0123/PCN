import ExcelJS from 'exceljs'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve('SBE_pending_heatmap_2026-09-04.xlsx')
const previous = resolve('SBE_pending_heatmap_2026-09-03.xlsx')
const input = existsSync(previous) ? previous : output
const database = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })
const rows = database.prepare(`
  WITH eligible AS (
    SELECT DISTINCT affected.pcn_id, affected.ti_part_id, organization.sbe1_id,
      lower(trim(COALESCE(part.industry, ''))) AS industry
    FROM pcn_ti_part affected
    JOIN ti_part part ON part.id = affected.ti_part_id
    JOIN ti_part_organization organization ON organization.ti_part_id = part.id
    JOIN material_month_revenue revenue ON revenue.normalized_part_number = part.normalized_part_number
    WHERE revenue.revenue_month BETWEEN strftime('%Y-%m', 'now', 'localtime', '-11 months')
      AND strftime('%Y-%m', 'now', 'localtime')
  ), pending AS (
    SELECT eligible.*, 'RA' AS document_type FROM eligible
    JOIN pcn_expected_risk risk ON risk.pcn_id = eligible.pcn_id
    WHERE risk.expected_risk IN ('MAJOR', 'MAJOR_D') AND NOT EXISTS (
      SELECT 1 FROM risk_assessment assessment
      JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
      WHERE assessment.pcn_id = eligible.pcn_id AND link.ti_part_id = eligible.ti_part_id
    ) AND NOT EXISTS (
      SELECT 1 FROM pcn
      JOIN delta_form form ON form.delta_pcn_number_base = pcn.pcn_number_base
      JOIN delta_form_item item ON item.delta_form_id = form.id
      JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = item.delta_part_id
      WHERE pcn.id = eligible.pcn_id AND mapping.ti_part_id = eligible.ti_part_id
    )
    UNION ALL
    SELECT eligible.*, 'PPAP' FROM eligible
    JOIN pcn_expected_risk risk ON risk.pcn_id = eligible.pcn_id
    WHERE risk.expected_risk IN ('MINOR', 'MAJOR') AND eligible.industry = 'automotive' AND NOT EXISTS (
      SELECT 1 FROM ppap document
      JOIN ppap_ti_part link ON link.ppap_id = document.id
      WHERE document.pcn_id = eligible.pcn_id AND link.ti_part_id = eligible.ti_part_id
    )
  )
  SELECT sbe1.name, sbe1.champion_email,
    COUNT(DISTINCT CASE WHEN document_type = 'RA' THEN ti_part_id END) AS pending_ra_parts,
    COUNT(DISTINCT CASE WHEN document_type = 'RA' THEN pcn_id END) AS pending_ra_pcns,
    COUNT(DISTINCT CASE WHEN document_type = 'PPAP' THEN ti_part_id END) AS pending_ppap_parts,
    COUNT(DISTINCT CASE WHEN document_type = 'PPAP' THEN pcn_id END) AS pending_ppap_pcns
  FROM sbe1
  LEFT JOIN pending ON pending.sbe1_id = sbe1.id
  GROUP BY sbe1.id
  ORDER BY sbe1.name`).all()

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(input)
const sheet = workbook.worksheets[0]
if (sheet.getCell('B1').value !== 'Champion Email') {
  sheet.spliceColumns(2, 0, [])
} else if (sheet.getCell('C1').value === 'Champion Email') {
  sheet.spliceColumns(3, 1)
}
sheet.getCell('B1').value = 'Champion Email'
for (let row = 2; row <= sheet.rowCount; row++) {
  const name = sheet.getCell(row, 1).value
  const match = rows.find(item => item.name === name)
  sheet.getCell(row, 2).value = match?.champion_email || ''
  sheet.getCell(row, 3).value = Number(match?.pending_ra_parts || 0)
  sheet.getCell(row, 4).value = Number(match?.pending_ra_pcns || 0)
  sheet.getCell(row, 5).value = Number(match?.pending_ppap_parts || 0)
  sheet.getCell(row, 6).value = Number(match?.pending_ppap_pcns || 0)
}
sheet.getColumn(2).width = 30
await workbook.xlsx.writeFile(output)
console.log(output)
