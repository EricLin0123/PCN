import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const databasePath = resolve(process.argv[2] || 'data/pcn.db')
const originalEmailDir = resolve(process.argv[3] || 'Delta_PCN_RA_PPAP_Emails')
const outputDir = resolve(process.argv[4] || 'Delta_PCN_RA_Follow_Up_Emails_2026-09-21')

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
const decodeHtml = value => String(value)
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .trim()
const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const normalizePart = value => String(value).trim().toUpperCase()
const slug = value => value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const unique = values => [...new Set(values.filter(value => value !== '' && value != null))]
const formatRevenue = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`

const requestedPairs = []
for (const filename of readdirSync(originalEmailDir).filter(name => name.endsWith('.eml')).sort()) {
  const email = readFileSync(resolve(originalEmailDir, filename), 'utf8')
  const originalSbe1 = email.match(/^Subject: .* - (.+)\r?$/m)?.[1]?.trim()
  if (!originalSbe1) throw new Error(`Could not read the SBE-1 name from ${filename}`)

  for (const match of email.matchAll(/<tr><td>(.*?)<\/td><td>(20\d{9})<\/td>/g)) {
    requestedPairs.push({
      originalSbe1,
      originalEmail: filename,
      normalizedPartNumber: normalizePart(decodeHtml(match[1])),
      pcnNumber: match[2]
    })
  }
}

const pairKeys = new Set()
for (const pair of requestedPairs) {
  const key = `${pair.normalizedPartNumber}:${pair.pcnNumber}`
  if (pairKeys.has(key)) throw new Error(`Duplicate PCN-part row in the original emails: ${key}`)
  pairKeys.add(key)
}

const database = new DatabaseSync(databasePath, { readOnly: true })
const period = database.prepare(`
  SELECT strftime('%Y-%m', 'now', 'localtime', '-11 months') AS start_month,
    strftime('%Y-%m', 'now', 'localtime') AS end_month
`).get()

const pairQuery = database.prepare(`
  SELECT pcn.id AS pcn_id, pcn.pcn_number_base, pcn.title,
    part.id AS ti_part_id, part.display_part_number, part.normalized_part_number,
    risk.expected_risk, sbe1.name AS sbe1_name,
    COALESCE(sbe1.champion_email, '') AS champion_email,
    COALESCE((
      SELECT sum(revenue.net_revenue)
      FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = part.normalized_part_number
        AND revenue.revenue_month BETWEEN ? AND ?
    ), 0) AS trailing_revenue,
    EXISTS (
      SELECT 1
      FROM material_month_revenue revenue
      WHERE revenue.normalized_part_number = part.normalized_part_number
        AND revenue.revenue_month BETWEEN ? AND ?
    ) AS has_trailing_sales,
    EXISTS (
      SELECT 1
      FROM delta_form form
      JOIN delta_form_item item ON item.delta_form_id = form.id
      JOIN delta_ti_part_mapping mapping ON mapping.delta_part_id = item.delta_part_id
      WHERE form.delta_pcn_number_base = pcn.pcn_number_base
        AND mapping.ti_part_id = part.id
    ) AS uploaded_to_delta,
    COALESCE((
      SELECT group_concat(value, char(10))
      FROM (
        SELECT DISTINCT assessment.ra_number AS value
        FROM risk_assessment assessment
        JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
        WHERE assessment.pcn_id = pcn.id AND link.ti_part_id = part.id
        ORDER BY value
      )
    ), '') AS ra_numbers,
    COALESCE((
      SELECT group_concat(value, char(10))
      FROM (
        SELECT DISTINCT assessment.workbook_filename AS value
        FROM risk_assessment assessment
        JOIN risk_assessment_ti_part link ON link.risk_assessment_id = assessment.id
        WHERE assessment.pcn_id = pcn.id AND link.ti_part_id = part.id
          AND assessment.workbook_filename <> ''
        ORDER BY value
      )
    ), '') AS ra_workbooks
  FROM ti_part part
  JOIN pcn_ti_part affected ON affected.ti_part_id = part.id
  JOIN pcn ON pcn.id = affected.pcn_id
  JOIN pcn_expected_risk risk ON risk.pcn_id = pcn.id
  LEFT JOIN ti_part_organization organization ON organization.ti_part_id = part.id
  LEFT JOIN sbe1 ON sbe1.id = organization.sbe1_id
  WHERE part.normalized_part_number = ? AND pcn.pcn_number_base = ?
`)

const reconciled = requestedPairs.map(pair => {
  const row = pairQuery.get(
    period.start_month,
    period.end_month,
    period.start_month,
    period.end_month,
    pair.normalizedPartNumber,
    pair.pcnNumber
  )
  if (!row) throw new Error(`Original request no longer matches the database: ${pair.normalizedPartNumber} / ${pair.pcnNumber}`)
  if (row.sbe1_name !== pair.originalSbe1) {
    throw new Error(`SBE-1 changed for ${pair.normalizedPartNumber} / ${pair.pcnNumber}: ${pair.originalSbe1} -> ${row.sbe1_name}`)
  }

  const stillEligible = Boolean(row.has_trailing_sales) && ['MAJOR', 'MAJOR_D'].includes(row.expected_risk)
  const status = row.ra_numbers
    ? 'ACQUIRED'
    : !stillEligible
      ? 'NO_LONGER_ELIGIBLE'
      : row.uploaded_to_delta
        ? 'UPLOADED_TO_DELTA_WITHOUT_MAPPED_RA'
        : 'FOLLOW_UP'
  return { ...pair, ...row, stillEligible, status }
})

const grouped = new Map()
for (const row of reconciled) {
  if (!grouped.has(row.sbe1_name)) grouped.set(row.sbe1_name, [])
  grouped.get(row.sbe1_name).push(row)
}

mkdirSync(outputDir, { recursive: true })

const reconciliationHeaders = [
  'SBE-1', 'Champion Email', 'TI Part Number', 'TI PCN Number', 'Expected Risk',
  `Net Revenue (${period.start_month} to ${period.end_month})`, 'Status', 'RA Number(s)',
  'RA Workbook(s)', 'Uploaded to Delta', 'Original Email'
]
const reconciliationLines = [reconciliationHeaders.map(escapeCsv).join(',')]
for (const row of reconciled) {
  reconciliationLines.push([
    row.sbe1_name, row.champion_email, row.display_part_number, row.pcn_number_base,
    row.expected_risk, row.trailing_revenue, row.status, row.ra_numbers,
    row.ra_workbooks, row.uploaded_to_delta ? 'YES' : 'NO', row.originalEmail
  ].map(escapeCsv).join(','))
}
writeFileSync(resolve(outputDir, 'RECONCILIATION.csv'), `${reconciliationLines.join('\n')}\n`)

const summary = [
  '# Delta PCN RA Follow-up Summary',
  '',
  `Generated on 2026-09-21 from the AWS-synced database. Revenue window: ${period.start_month} through ${period.end_month}.`,
  '',
  'Only exact PCN-part rows from the original `Delta_PCN_RA_PPAP_Emails` batch are reconciled. `FOLLOW_UP` uses the application pending-RA rule: rolling-12-month sales, MAJOR/MAJOR_D risk, no exact RA coverage, and not already uploaded to Delta.',
  '',
  '| SBE-1 | Champion Email | Originally Requested | Acquired | Uploaded Without Mapped RA | Follow-up Rows | Follow-up PCNs | Follow-up Parts | Email File |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
]

let emailCount = 0
for (const [sbe1Name, rows] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
  const followUpRows = rows.filter(row => row.status === 'FOLLOW_UP')
    .sort((left, right) => left.normalized_part_number.localeCompare(right.normalized_part_number)
      || left.pcn_number_base.localeCompare(right.pcn_number_base))
  const acquiredRows = rows.filter(row => row.status === 'ACQUIRED')
  const uploadedRows = rows.filter(row => row.status === 'UPLOADED_TO_DELTA_WITHOUT_MAPPED_RA')
  const followUpPcns = new Set(followUpRows.map(row => row.pcn_id)).size
  const followUpParts = new Set(followUpRows.map(row => row.ti_part_id)).size
  const championEmails = unique(rows.map(row => row.champion_email))
  if (championEmails.length > 1) throw new Error(`Conflicting champion emails for ${sbe1Name}`)
  const championEmail = championEmails[0] || ''
  let filename = ''

  if (followUpRows.length) {
    filename = `Delta_PCN_RA_Follow_Up_${slug(sbe1Name)}.eml`
    const totalRevenue = followUpRows.reduce((sum, row) => sum + Number(row.trailing_revenue), 0)
    const tableRows = followUpRows.map(row => `<tr><td>${escapeHtml(row.display_part_number)}</td><td>${escapeHtml(row.pcn_number_base)}</td><td>${escapeHtml(row.title)}</td><td align="right">${escapeHtml(formatRevenue(row.trailing_revenue))}</td></tr>`).join('')
    const table = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt"><thead><tr style="background:#e8eef5"><th align="left">TI Part Number</th><th align="left">TI PCN Number</th><th align="left">Corresponding PCN Title</th><th align="right">NR (Past 12 Months)</th></tr></thead><tbody>${tableRows}<tr style="font-weight:bold;background:#f3f6fa"><td colspan="3" align="right">Total NR</td><td align="right">${escapeHtml(formatRevenue(totalRevenue))}</td></tr></tbody></table>`
    const receivedNote = acquiredRows.length
      ? `<p>Thank you for the RA support already provided. We have recorded ${countLabel(acquiredRows.length, 'completed PCN-part item')} from the earlier request; the table below contains only the items that remain outstanding in our tracker.</p>`
      : '<p>Our tracker does not yet show an RA against any of the PCN-part items in the earlier request.</p>'
    const body = `<div style="font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#202124"><p>Dear ${escapeHtml(sbe1Name)} team,</p><p>This is a follow-up to our earlier Delta PCN RA request. Delta is a worldwide Top 10 TI customer, and closing these outstanding RA items is important to completing the remaining customer PCN actions.</p>${receivedNote}<p><strong>Outstanding RA:</strong> ${countLabel(followUpParts, 'TI part')} across ${countLabel(followUpPcns, 'PCN')} (${countLabel(followUpRows.length, 'PCN-part row')}).</p>${table}<p>Please use the previously shared Delta-standard RA template. Its consistent format helps Delta review the change efficiently and avoids preventable rework or rejection.</p><p><strong>Please acknowledge this follow-up within two business days</strong> and confirm the responsible owner and expected completion date. Please then complete and return the outstanding RAs as soon as possible. If an RA has already been provided, reply with the file name or upload location so we can reconcile our tracker promptly.</p><p>If any ownership, part, or PCN information is incorrect, please identify the affected row in your reply.</p><p>Best regards,<br>TI Sales</p></div>`
    const eml = `From: TI Sales <no-reply@ti.com>\r\nTo: ${championEmail || 'undisclosed-recipients:;'}\r\nSubject: [Follow-up][Action Required] Outstanding Delta PCN RA - ${sbe1Name}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`
    writeFileSync(resolve(outputDir, filename), eml)
    emailCount++
  }

  summary.push(`| ${sbe1Name} | ${championEmail} | ${rows.length} | ${acquiredRows.length} | ${uploadedRows.length} | ${followUpRows.length} | ${followUpPcns} | ${followUpParts} | ${filename} |`)
}

const counts = Object.fromEntries(['ACQUIRED', 'UPLOADED_TO_DELTA_WITHOUT_MAPPED_RA', 'NO_LONGER_ELIGIBLE', 'FOLLOW_UP']
  .map(status => [status, reconciled.filter(row => row.status === status).length]))
summary.push(
  '',
  `- Original requested PCN-part rows: ${reconciled.length}`,
  `- Exact RA coverage acquired: ${counts.ACQUIRED}`,
  `- Uploaded to Delta without mapped RA: ${counts.UPLOADED_TO_DELTA_WITHOUT_MAPPED_RA}`,
  `- No longer eligible: ${counts.NO_LONGER_ELIGIBLE}`,
  `- Actionable follow-up rows: ${counts.FOLLOW_UP}`,
  `- Follow-up email files: ${emailCount}`,
  '',
  'See `RECONCILIATION.csv` for every original requested row, its current status, and any mapped RA number/workbook.'
)
writeFileSync(resolve(outputDir, 'SUMMARY.md'), `${summary.join('\n')}\n`)

database.close()
console.log(JSON.stringify({
  databasePath,
  originalEmailDir,
  outputDir,
  revenueWindow: period,
  requestedRows: reconciled.length,
  ...counts,
  emailCount
}, null, 2))
