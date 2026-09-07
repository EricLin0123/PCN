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
    ) AND NOT EXISTS (
      SELECT 1 FROM pcn
      JOIN delta_form form ON form.delta_pcn_number_base = pcn.pcn_number_base
      JOIN delta_form_item item ON item.delta_form_id = form.id
      JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = item.delta_part_id
      WHERE pcn.id = eligible.pcn_id AND mapping.ti_part_id = eligible.ti_part_id
    )
  )
  SELECT sbe1.name, sbe1.champion_email, pending.document_type,
    pending.ti_part_id, p.pcn_number_base, p.title AS pcn_title, tp.display_part_number,
    COALESCE((SELECT SUM(revenue.net_revenue)
      FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = tp.normalized_part_number
        AND revenue.revenue_month BETWEEN strftime('%Y-%m', 'now', 'localtime', '-11 months')
          AND strftime('%Y-%m', 'now', 'localtime')), 0) AS net_revenue
  FROM pending
  JOIN sbe1 ON sbe1.id = pending.sbe1_id
  JOIN pcn p ON p.id = pending.pcn_id
  JOIN ti_part tp ON tp.id = pending.ti_part_id
  ORDER BY sbe1.name, tp.normalized_part_number, p.pcn_number_base
`).all()

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const slug = value => value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const grouped = new Map()
for (const row of rows) {
  if (!grouped.has(row.name)) grouped.set(row.name, { name: row.name, email: row.champion_email, RA: [] })
  grouped.get(row.name)[row.document_type].push(row)
}

const formatRevenue = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
const table = (items, heading) => {
  const totalRevenue = items.reduce((total, item) => total + Number(item.net_revenue || 0), 0)
  return `<h3>${heading}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt"><thead><tr style="background:#e8eef5"><th align="left">TI Part Number</th><th align="left">TI PCN Number</th><th align="left">Corresponding PCN Title</th><th align="right">NR (Past 12 Months)</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.display_part_number)}</td><td>${esc(item.pcn_number_base)}</td><td>${esc(item.pcn_title)}</td><td align="right">${esc(formatRevenue(item.net_revenue))}</td></tr>`).join('')}<tr style="font-weight:bold;background:#f3f6fa"><td colspan="3" align="right">Total NR</td><td align="right">${esc(formatRevenue(totalRevenue))}</td></tr></tbody></table>`
}
const sentence = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`
const safeEmail = value => value || 'undisclosed-recipients:;'
const raUploadFolder = 'https://sps16.itg.ti.com/sites/ticsc/_layouts/15/start.aspx#/Shared%20Documents/Forms/AllItems.aspx?RootFolder=%2Fsites%2Fticsc%2FShared%20Documents%2FDelta%20PCN%20Support%2FRisk%20Assessment%20Reports'

const summary = ['| SBE-1 | Champion Email | RA PCNs | RA Parts | PCN-Part Rows | Email File |', '| --- | --- | ---: | ---: | ---: | --- |']
for (const group of grouped.values()) {
  const filename = `Delta_PCN_RA_${slug(group.name)}.eml`
  const raPcnCount = new Set(group.RA.map(item => item.pcn_number_base)).size
  const raPartCount = new Set(group.RA.map(item => item.ti_part_id)).size
  const raTable = table(group.RA, 'RA required')
  const targetEmail = safeEmail(group.email)
  const body = `<div style="font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#202124"><p><strong>Target email:</strong> ${esc(targetEmail)}</p><p>Dear ${esc(group.name)} team,</p><p>Thank you for your previous cooperation in providing the Risk Assessment report (RA). We are reviewing another round of Delta PCNs, and the missing RAs requiring your support are listed below.</p><p><strong>RA required:</strong> Please review ${sentence(raPartCount, 'TI part')} across ${sentence(raPcnCount, 'PCN')} (${sentence(group.RA.length, 'PCN-part row')}). Similar parts and changes may share an RA where appropriate.</p><p>The RA template will be attached separately. <strong>Please complete and upload all requested RAs to the <a href="${esc(raUploadFolder)}">Delta PCN Support – Risk Assessment Reports SharePoint folder</a> by September 18, 2026.</strong></p><p>Let us know if any listed ownership, part, or PCN information is incorrect.</p><p>Best regards,<br>TI Sales</p>${raTable}</div>`
  const eml = `From: TI Sales <no-reply@ti.com>\r\nSubject: [Delta PCN Action Required] RA Request - ${group.name}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`
  writeFileSync(resolve(outputDir, filename), eml)
  summary.push(`| ${group.name} | ${group.email || ''} | ${raPcnCount} | ${raPartCount} | ${group.RA.length} | ${filename} |`)
}
writeFileSync(resolve(outputDir, 'SUMMARY.md'), `# Delta PCN RA Email Summary\n\nGenerated from the application pending-RA rules on ${new Date().toISOString().slice(0, 10)}.\n\n${summary.join('\n')}\n`)
console.log(JSON.stringify({ actionableSbe1: grouped.size, emailFiles: grouped.size, outputDir, organizations: [...grouped.keys()] }, null, 2))
