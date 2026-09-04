import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const db = new DatabaseSync(resolve('data/pcn.db'), { readOnly: true })
const outputDir = resolve('Delta_PCN_RA_PPAP_Emails')
mkdirSync(outputDir, { recursive: true })

const rows = db.prepare(`
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
  SELECT sbe1.name, sbe1.champion_email, pending.document_type,
    p.pcn_number_base, tp.display_part_number
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
  if (!grouped.has(row.name)) grouped.set(row.name, { name: row.name, email: row.champion_email, RA: [], PPAP: [] })
  grouped.get(row.name)[row.document_type].push(row)
}

const table = (items, heading) => `<h3>${heading}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt"><thead><tr style="background:#e8eef5"><th align="left">TI PCN Number</th><th align="left">${heading === 'RA required' ? 'Part Number' : 'Automotive Part Number'}</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.pcn_number_base)}</td><td>${esc(item.display_part_number)}</td></tr>`).join('')}</tbody></table>`
const sentence = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`
const safeEmail = value => value || 'undisclosed-recipients:;'

const summary = ['| SBE-1 | RA PCNs | RA Parts | PPAP PCNs | PPAP Parts | Email File |', '| --- | ---: | ---: | ---: | ---: | --- |']
for (const group of grouped.values()) {
  const types = ['RA', 'PPAP'].filter(type => group[type].length)
  const both = types.length === 2
  const subjectType = both ? 'RA & PPAP' : types[0]
  const filename = `Delta_PCN_RA_PPAP_${slug(group.name)}.eml`
  const raPcnCount = new Set(group.RA.map(item => item.pcn_number_base)).size
  const ppapPcnCount = new Set(group.PPAP.map(item => item.pcn_number_base)).size
  const intro = both ? 'We need your team\'s support on the outstanding RA and PPAP items below.' : `We need your team\'s support on the outstanding ${subjectType} items below.`
  const process = both ? 'As a brief refresher, Major PCNs require additional Risk Assessment (RA) documentation, while automotive parts may require PPAP documentation. For the PCNs below, please provide the applicable documents so we can complete the remaining Delta actions.' : `As a brief refresher, ${subjectType === 'RA' ? 'Major PCNs require additional Risk Assessment (RA) documentation' : 'automotive parts may require PPAP documentation'}. For the PCNs below, please provide the required documents so we can complete the remaining Delta actions.`
  const body = `<div style="font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#202124"><p>Hello ${esc(group.name)} SBE-1 Champion,</p><p>Delta is one of TI's worldwide Top 10 customers and is actively requesting closure of outstanding Product Change Notification (PCN) documentation and uploads in Delta's PCN management system. This is an important customer commitment and cross-BU coordination item. ${intro}</p><p>${process}</p>${group.RA.length ? `<p><strong>RA required:</strong> Please complete ${sentence(group.RA.length, 'RA part')} across ${sentence(raPcnCount, 'PCN')}.</p>${table(group.RA, 'RA required')}` : ''}${group.PPAP.length ? `<p><strong>PPAP required:</strong> Please complete ${sentence(group.PPAP.length, 'automotive part')} across ${sentence(ppapPcnCount, 'PCN')}.</p>${table(group.PPAP, 'PPAP required')}` : ''}<p>The required RA and PPAP templates will be attached manually. Please follow the applicable Delta-standard template strictly. Delta applies these templates consistently across its suppliers; using the required format helps Delta review and digest PCN information efficiently and avoids unnecessary back-and-forth or rejection caused by formatting or content differences.</p><p>Please review the listed PCNs and parts, coordinate with the appropriate BU or product-line owner as needed, complete the required document(s), and return them to us so we can proceed with the Delta PCN submission. Please let me know if any listed ownership, part, or PCN information appears incorrect or if clarification is needed.</p><p>Best regards,<br>TI Sales</p></div>`
  const eml = `From: TI Sales <no-reply@ti.com>\r\nTo: ${safeEmail(group.email)}\r\nSubject: [Delta PCN Action Required] ${subjectType} Request - ${group.name}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`
  writeFileSync(resolve(outputDir, filename), eml)
  summary.push(`| ${group.name} | ${raPcnCount} | ${group.RA.length} | ${ppapPcnCount} | ${group.PPAP.length} | ${filename} |`)
}
writeFileSync(resolve(outputDir, 'SUMMARY.md'), `# Delta PCN RA/PPAP Email Summary\n\nGenerated from the application pending-document rules on ${new Date().toISOString().slice(0, 10)}.\n\n${summary.join('\n')}\n`)
console.log(JSON.stringify({ actionableSbe1: grouped.size, emailFiles: grouped.size, outputDir, organizations: [...grouped.keys()] }, null, 2))
