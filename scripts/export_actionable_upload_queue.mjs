import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import { resolve } from 'node:path'

const db = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })
const rows = db.prepare(`
  SELECT p.pcn_number_base, p.notification_date, p.title,
    ops.expected_risk, ex.executive_state, ops.upload_state,
    ops.total_parts, ops.delta_relevant_parts, ops.uploaded_parts,
    documents.ppap_required_parts, documents.ppap_document_state,
    documents.ra_required_parts, documents.ra_covered_parts,
    documents.ra_document_state, rac.ra_state,
    (SELECT count(*) FROM risk_assessment ra WHERE ra.pcn_id = p.id) AS ra_count,
    (SELECT group_concat(tp.display_part_number, '; ')
       FROM pcn_ti_part link JOIN ti_part tp ON tp.id = link.ti_part_id
      WHERE link.pcn_id = p.id
        AND EXISTS (SELECT 1 FROM delta_ti_part_mapping m WHERE m.ti_part_id = tp.id)
        AND NOT EXISTS (
          SELECT 1 FROM delta_form df
          JOIN delta_form_item dfi ON dfi.delta_form_id = df.id
          JOIN delta_ti_part_mapping m2 ON m2.delta_part_id = dfi.delta_part_id
          WHERE df.delta_pcn_number_base = p.pcn_number_base AND m2.ti_part_id = tp.id
        )
    ) AS missed_parts,
    COALESCE((SELECT sum(mmr.net_revenue)
      FROM pcn_ti_part link JOIN ti_part tp ON tp.id = link.ti_part_id
      JOIN material_month_revenue mmr ON mmr.normalized_part_number = tp.normalized_part_number
      WHERE link.pcn_id = p.id AND mmr.revenue_month BETWEEN '2025-08' AND strftime('%Y-%m', 'now', 'localtime')), 0) AS net_revenue
  FROM pcn p
  JOIN pcn_operational_status ops ON ops.pcn_id = p.id
  JOIN pcn_document_status documents ON documents.pcn_id = p.id
  JOIN pcn_ra_coverage rac ON rac.pcn_id = p.id
  JOIN pcn_executive_status ex ON ex.pcn_id = p.id
  WHERE (ex.executive_state = 'MINOR_PENDING_UPLOAD' AND documents.ppap_required_parts = 0)
     OR (ex.executive_state = 'MAJOR_PENDING_UPLOAD' AND documents.ra_document_state = 'ACQUIRED')
  ORDER BY CASE ex.executive_state WHEN 'MAJOR_PENDING_UPLOAD' THEN 1 ELSE 2 END,
    net_revenue DESC, p.notification_date DESC, p.pcn_number_base DESC
`).all()

const workbook = new ExcelJS.Workbook()
workbook.creator = 'PCN Workbench'
workbook.created = new Date()
const summary = workbook.addWorksheet('Summary')
summary.columns = [{ header: 'Queue', key: 'queue', width: 28 }, { header: 'Records', key: 'records', width: 12 }, { header: 'Action', key: 'action', width: 55 }]
summary.addRows([
  { queue: 'MINOR_PENDING_UPLOAD', records: rows.filter(r => r.executive_state === 'MINOR_PENDING_UPLOAD').length, action: 'Upload affected Delta materials; PPAP is not required.' },
  { queue: 'MAJOR_PENDING_UPLOAD', records: rows.filter(r => r.executive_state === 'MAJOR_PENDING_UPLOAD').length, action: 'Upload affected Delta materials; RA coverage is acquired.' },
])
summary.addRow([])
summary.addRow(['Definition', 'This workbook uses the current SQLite-derived executive, document, and upload views.'])

const sheet = workbook.addWorksheet('Action Queue')
sheet.columns = [
  { header: 'Queue', key: 'executive_state', width: 25 }, { header: 'PCN Number', key: 'pcn_number_base', width: 16 },
  { header: 'Notification Date', key: 'notification_date', width: 18 }, { header: 'Title', key: 'title', width: 45 },
  { header: 'Expected Risk', key: 'expected_risk', width: 14 }, { header: 'Upload State', key: 'upload_state', width: 18 },
  { header: 'Affected Parts', key: 'total_parts', width: 14 }, { header: 'Delta-Relevant Parts', key: 'delta_relevant_parts', width: 20 },
  { header: 'Uploaded Parts', key: 'uploaded_parts', width: 16 }, { header: 'Missed Parts to Upload', key: 'missed_parts', width: 55 },
  { header: 'PPAP Required Parts', key: 'ppap_required_parts', width: 20 }, { header: 'PPAP State', key: 'ppap_document_state', width: 16 },
  { header: 'RA Count', key: 'ra_count', width: 12 }, { header: 'RA Coverage', key: 'ra_covered_parts', width: 16 },
  { header: 'RA State', key: 'ra_document_state', width: 16 }, { header: '12M Net Revenue', key: 'net_revenue', width: 18 },
]
sheet.addRows(rows)
sheet.views = [{ state: 'frozen', ySplit: 1 }]
sheet.autoFilter = { from: 'A1', to: `P${rows.length + 1}` }
for (const ws of [summary, sheet]) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  ws.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true } })
}
sheet.getColumn('net_revenue').numFmt = '#,##0.00'
await workbook.xlsx.writeFile('Actionable_Upload_Queue.xlsx')
console.log(`Created Actionable_Upload_Queue.xlsx with ${rows.length} records`)
