import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const db = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })
const outputDir = resolve('Delta_PCN_RA_PPAP_Emails')
mkdirSync(outputDir, { recursive: true })

const rows = db.prepare(`
  WITH eligible AS (
    SELECT DISTINCT affected.pcn_id, affected.ti_part_id, organization.sbe1_id
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
    )
  )
  SELECT sbe1.name, sbe1.champion_email, pending.document_type,
    pending.ti_part_id, p.pcn_number_base, tp.display_part_number,
    COALESCE((SELECT SUM(revenue.net_revenue)
      FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = tp.normalized_part_number
        AND revenue.revenue_month BETWEEN '2025-08' AND strftime('%Y-%m', 'now', 'localtime')), 0) AS net_revenue
  FROM pending
  JOIN sbe1 ON sbe1.id = pending.sbe1_id
  JOIN pcn p ON p.id = pending.pcn_id
  JOIN ti_part tp ON tp.id = pending.ti_part_id
  ORDER BY sbe1.name, pending.document_type, p.pcn_number_base, tp.display_part_number
`).all()

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const slug = value => value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const grouped = new Map()
for (const row of rows) {
  if (!grouped.has(row.name)) grouped.set(row.name, { name: row.name, email: row.champion_email, RA: [] })
  grouped.get(row.name)[row.document_type].push(row)
}

for (const group of grouped.values()) {
  const byPart = new Map()
  for (const item of group.RA) {
    if (!byPart.has(item.ti_part_id)) {
      byPart.set(item.ti_part_id, { ...item, pcnNumbers: new Set() })
    }
    byPart.get(item.ti_part_id).pcnNumbers.add(item.pcn_number_base)
  }
  group.RA = [...byPart.values()].map(item => ({
    ...item,
    pcn_number_base: [...item.pcnNumbers].sort().join(', ')
  }))
}

const formatRevenue = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
const table = (items, heading) => {
  const totalRevenue = items.reduce((total, item) => total + Number(item.net_revenue || 0), 0)
  return `<h3>${heading}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt"><thead><tr style="background:#e8eef5"><th align="left">Part Number</th><th align="left">TI PCN Number(s)</th><th align="right">NR (Aug 2025–today)</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.display_part_number)}</td><td>${esc(item.pcn_number_base)}</td><td align="right">${esc(formatRevenue(item.net_revenue))}</td></tr>`).join('')}<tr style="font-weight:bold;background:#f3f6fa"><td colspan="2" align="right">Total NR</td><td align="right">${esc(formatRevenue(totalRevenue))}</td></tr></tbody></table>`
}
const sentence = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`
const safeEmail = value => value || 'undisclosed-recipients:;'

const summary = ['| SBE-1 | Champion Email | RA PCNs | RA Parts | Email File |', '| --- | --- | ---: | ---: | --- |']
for (const group of grouped.values()) {
  const filename = `Delta_PCN_RA_${slug(group.name)}.eml`
  const raPcnCount = new Set(group.RA.flatMap(item => item.pcn_number_base.split(', '))).size
  const raTable = table(group.RA, 'RA required')
  const targetEmail = safeEmail(group.email)
  const body = `<div style="font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#202124"><p><strong>Target email:</strong> ${esc(targetEmail)}</p><p>Dear ${esc(group.name)} team,</p><p>Thank you for your previous cooperation in providing RAs. We are reviewing another round of Delta PCNs, and the missing RAs requiring your support are listed below.</p><p><strong>RA required:</strong> Please complete ${sentence(group.RA.length, 'RA part')} across ${sentence(raPcnCount, 'PCN')}.</p><p>The RA template will be attached separately. Please return the completed RAs so we can proceed with the Delta PCN submission. Let us know if any listed ownership, part, or PCN information is incorrect.</p><p>Best regards,<br>TI Sales</p>${raTable}</div>`
  const eml = `From: TI Sales <no-reply@ti.com>\r\nSubject: [Delta PCN Action Required] RA Request - ${group.name}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`
  writeFileSync(resolve(outputDir, filename), eml)
  summary.push(`| ${group.name} | ${group.email || ''} | ${raPcnCount} | ${group.RA.length} | ${filename} |`)
}
writeFileSync(resolve(outputDir, 'SUMMARY.md'), `# Delta PCN RA Email Summary\n\nGenerated from the application pending-RA rules on ${new Date().toISOString().slice(0, 10)}.\n\n${summary.join('\n')}\n`)
console.log(JSON.stringify({ actionableSbe1: grouped.size, emailFiles: grouped.size, outputDir, organizations: [...grouped.keys()] }, null, 2))
