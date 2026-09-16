import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import { resolve } from 'node:path'

const revenueFrom = '2025-10'
const revenueTo = '2026-09'
const output = resolve(`Pending_PPAP_Parts_${revenueFrom}_to_${revenueTo}.xlsx`)
const db = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })

const rows = db.prepare(`
  WITH pending_links AS (
    SELECT DISTINCT
      tp.id AS ti_part_id,
      p.id AS pcn_id,
      p.pcn_number_base,
      p.notification_date,
      p.title,
      risk.expected_risk,
      ex.executive_state,
      documents.ppap_document_state
    FROM pcn p
    JOIN pcn_executive_status ex ON ex.pcn_id = p.id
    JOIN pcn_expected_risk risk ON risk.pcn_id = p.id
    JOIN pcn_document_status documents ON documents.pcn_id = p.id
    JOIN pcn_ti_part affected ON affected.pcn_id = p.id
    JOIN ti_part tp ON tp.id = affected.ti_part_id
    WHERE ex.executive_state IN ('MINOR_PENDING_UPLOAD', 'MAJOR_PENDING_UPLOAD')
      AND risk.expected_risk IN ('MINOR', 'MAJOR')
      AND lower(trim(COALESCE(tp.industry, ''))) = 'automotive'
      AND EXISTS (
        SELECT 1
        FROM material_month_revenue revenue
        WHERE revenue.normalized_part_number = tp.normalized_part_number
          AND revenue.revenue_month BETWEEN ? AND ?
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ppap document
        JOIN ppap_ti_part link ON link.ppap_id = document.id
        WHERE document.pcn_id = p.id
          AND link.ti_part_id = tp.id
      )
  ), part_revenue AS (
    SELECT
      tp.id AS ti_part_id,
      sum(revenue.net_revenue) AS net_revenue,
      count(DISTINCT revenue.revenue_month) AS sales_months
    FROM ti_part tp
    JOIN material_month_revenue revenue
      ON revenue.normalized_part_number = tp.normalized_part_number
    WHERE revenue.revenue_month BETWEEN ? AND ?
    GROUP BY tp.id
  )
  SELECT
    tp.display_part_number,
    tp.industry,
    COALESCE(sbe.name, '') AS sbe,
    COALESCE(sbe1.name, '') AS sbe1,
    COALESCE(sbe1.champion_email, '') AS champion_email,
    COALESCE(sbe2.name, '') AS sbe2,
    revenue.net_revenue,
    revenue.sales_months,
    count(*) AS pending_pcn_count,
    count(DISTINCT pending.executive_state) AS queue_count,
    group_concat(pending.executive_state, char(10)) AS queues,
    group_concat(pending.expected_risk, char(10)) AS risks,
    group_concat(pending.ppap_document_state, char(10)) AS ppap_states,
    group_concat(COALESCE(pending.notification_date, ''), char(10)) AS notification_dates,
    group_concat(pending.pcn_number_base || ' — ' || pending.title, char(10)) AS pcn_and_title
  FROM (
    SELECT * FROM pending_links
    ORDER BY pcn_number_base
  ) pending
  JOIN ti_part tp ON tp.id = pending.ti_part_id
  JOIN part_revenue revenue ON revenue.ti_part_id = tp.id
  LEFT JOIN ti_part_organization organization ON organization.ti_part_id = tp.id
  LEFT JOIN sbe ON sbe.id = organization.sbe_id
  LEFT JOIN sbe1 ON sbe1.id = organization.sbe1_id
  LEFT JOIN sbe2 ON sbe2.id = organization.sbe2_id
  GROUP BY tp.id
  ORDER BY revenue.net_revenue DESC, tp.normalized_part_number
`).all(revenueFrom, revenueTo, revenueFrom, revenueTo)

const queueCounts = db.prepare(`
  SELECT executive_state, count(*) AS pcn_count
  FROM pcn_executive_status
  WHERE executive_state IN ('MINOR_PENDING_UPLOAD', 'MAJOR_PENDING_UPLOAD')
  GROUP BY executive_state
  ORDER BY executive_state
`).all()

const workbook = new ExcelJS.Workbook()
workbook.creator = 'PCN Workbench'
workbook.created = new Date()
workbook.subject = 'Pending PPAP parts with trailing-12-month sales'

const summary = workbook.addWorksheet('Summary')
summary.columns = [
  { header: 'Item', key: 'item', width: 34 },
  { header: 'Value', key: 'value', width: 70 }
]
summary.addRows([
  { item: 'Revenue period', value: `${revenueFrom} through ${revenueTo} (inclusive)` },
  { item: 'Pending PPAP definition', value: 'Automotive TI part with a sales record in the revenue period, mapped to a MINOR or MAJOR PCN in either pending-upload executive queue, and not covered by a PPAP for that exact PCN-part relationship.' },
  { item: 'Output grain', value: 'One TI part per row; multiple PCNs are combined with line breaks in one cell.' },
  { item: 'Pending PPAP parts', value: rows.length },
  { item: 'Pending PCN-part relationships', value: rows.reduce((sum, row) => sum + Number(row.pending_pcn_count), 0) },
  { item: 'Total 12-month NR', value: rows.reduce((sum, row) => sum + Number(row.net_revenue), 0) }
])
summary.addRow({ item: '', value: '' })
for (const queue of queueCounts) summary.addRow({ item: `${queue.executive_state} PCNs`, value: queue.pcn_count })

const sheet = workbook.addWorksheet('Pending PPAP Parts')
sheet.columns = [
  { header: 'TI Part Number', key: 'display_part_number', width: 24 },
  { header: 'SBE', key: 'sbe', width: 18 },
  { header: 'SBE-1', key: 'sbe1', width: 20 },
  { header: 'SBE-1 Champion', key: 'champion_email', width: 34 },
  { header: 'SBE-2', key: 'sbe2', width: 22 },
  { header: 'Industry', key: 'industry', width: 14 },
  { header: '12 Month NR', key: 'net_revenue', width: 18 },
  { header: 'Sales Months', key: 'sales_months', width: 14 },
  { header: 'Pending PCN Count', key: 'pending_pcn_count', width: 19 },
  { header: 'Pending Upload Queue(s)', key: 'queues', width: 28 },
  { header: 'Risk(s)', key: 'risks', width: 12 },
  { header: 'PPAP Status(es)', key: 'ppap_states', width: 20 },
  { header: 'Notification Date(s)', key: 'notification_dates', width: 20 },
  { header: 'PCN Number — Title', key: 'pcn_and_title', width: 74 }
]
sheet.addRows(rows)
sheet.addTable({
  name: 'PendingPPAPParts',
  ref: 'A1',
  headerRow: true,
  totalsRow: false,
  style: { theme: 'TableStyleMedium2', showRowStripes: true },
  columns: sheet.columns.map(column => ({ name: column.header })),
  rows: rows.map(row => sheet.columns.map(column => row[column.key]))
})

for (const worksheet of [summary, sheet]) {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  worksheet.eachRow(row => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
}

summary.getCell('B6').numFmt = '$#,##0.00;[Red]-$#,##0.00'
sheet.getColumn('net_revenue').numFmt = '$#,##0.00;[Red]-$#,##0.00'
sheet.autoFilter = { from: 'A1', to: `N${rows.length + 1}` }

await workbook.xlsx.writeFile(output)
console.log(JSON.stringify({ output, parts: rows.length, queueCounts }, null, 2))
