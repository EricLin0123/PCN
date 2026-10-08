import { all } from './db'
import { pendingDocumentsCte } from './pendingDocuments'

// CSC confirmed these teams completed their RA uploads outside the tracked data.
// Keep this exception scoped to reminder generation until CSC records the RAs.
const completedSbe1Names = ['SR', 'HVP', 'DCC'] as const

interface PendingRaRow {
  sbe1_id: number
  sbe1_name: string
  champion_email: string | null
  pcn_id: number
  pcn_number_base: string
  title: string
  ti_part_id: number
  display_part_number: string
}

interface SummaryRow {
  sbe1_id: number
  sbe1_name: string
  champion_email: string | null
  pending_part_count: number
  pending_pcn_count: number
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

function summaryTable(rows: SummaryRow[], currentId: number) {
  const maxPending = Math.max(...rows.map(row => row.pending_part_count), 1)
  const body = rows.map((row, index) => {
    const ratio = row.pending_part_count / maxPending
    const background = row.pending_part_count === 0 ? '#b7e4c7' : `hsl(${120 * (1 - ratio)} 78% 80%)`
    const border = row.sbe1_id === currentId ? '3px solid #111827' : '1px solid #9ca3af'
    return `<tr style="background:${background}">
    <td style="border:${border};padding:8px;text-align:center">${index + 1}</td>
    <td style="border:${border};padding:8px"><strong>${escapeHtml(row.sbe1_name)}</strong></td>
    <td style="border:${border};padding:8px;text-align:right;font-weight:700">${row.pending_part_count}</td>
    <td style="border:${border};padding:8px;text-align:right">${row.pending_pcn_count}</td>
  </tr>`
  }).join('')
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#111827">
    <thead><tr style="background:#111827;color:#fff"><th style="padding:8px">Rank</th><th style="padding:8px;text-align:left">SBE-1</th><th style="padding:8px;text-align:right">Pending RA parts</th><th style="padding:8px;text-align:right">Affected PCNs</th></tr></thead>
    <tbody>${body}</tbody></table>`
}

export function generateSbe1RaReminderEmails() {
  const completedPlaceholders = completedSbe1Names.map(() => '?').join(', ')
  const pendingRows = all<PendingRaRow>(`${pendingDocumentsCte}
    SELECT pending.sbe1_id, sbe1.name AS sbe1_name, sbe1.champion_email,
      pending.pcn_id, pcn.pcn_number_base, pcn.title,
      pending.ti_part_id, part.display_part_number
    FROM pending
    JOIN sbe1 ON sbe1.id = pending.sbe1_id
    JOIN pcn ON pcn.id = pending.pcn_id
    JOIN ti_part part ON part.id = pending.ti_part_id
    WHERE pending.document_type = 'RA' AND upper(trim(sbe1.name)) NOT IN (${completedPlaceholders})
    ORDER BY sbe1.name, pcn.notification_date, pcn.pcn_number_base, part.normalized_part_number`, ...completedSbe1Names)
  const summaries = all<SummaryRow>(`${pendingDocumentsCte}
    SELECT sbe1.id AS sbe1_id, sbe1.name AS sbe1_name, sbe1.champion_email,
      count(DISTINCT CASE WHEN upper(trim(sbe1.name)) NOT IN (${completedPlaceholders}) THEN pending.ti_part_id END) AS pending_part_count,
      count(DISTINCT CASE WHEN upper(trim(sbe1.name)) NOT IN (${completedPlaceholders}) THEN pending.pcn_id END) AS pending_pcn_count
    FROM sbe1 LEFT JOIN pending ON pending.sbe1_id = sbe1.id AND pending.document_type = 'RA'
    GROUP BY sbe1.id
    ORDER BY pending_part_count DESC, pending_pcn_count DESC, sbe1.name`, ...completedSbe1Names, ...completedSbe1Names).map(row => ({
      ...row,
      pending_part_count: Number(row.pending_part_count),
      pending_pcn_count: Number(row.pending_pcn_count)
    }))
  const bySbe1 = new Map<number, PendingRaRow[]>()
  for (const row of pendingRows) {
    if (!bySbe1.has(row.sbe1_id)) bySbe1.set(row.sbe1_id, [])
    bySbe1.get(row.sbe1_id)!.push(row)
  }
  const overviewText = summaries.map((row, index) => `${index + 1}. ${row.sbe1_name}: ${plural(row.pending_part_count, 'part')} across ${plural(row.pending_pcn_count, 'PCN')}`).join('\n')
  const emails = summaries.flatMap((summary) => {
    if (!summary.champion_email || summary.pending_part_count === 0) return []
    const rows = bySbe1.get(summary.sbe1_id) || []
    const detailText = rows.map(row => `- ${row.display_part_number}: ${row.pcn_number_base} — ${row.title || '—'}`).join('\n')
    const detailHtml = rows.map(row => `<tr><td style="border:1px solid #9ca3af;padding:8px"><strong>${escapeHtml(row.display_part_number)}</strong></td><td style="border:1px solid #9ca3af;padding:8px">${escapeHtml(row.pcn_number_base)}</td><td style="border:1px solid #9ca3af;padding:8px">${escapeHtml(row.title || '—')}</td></tr>`).join('')
    return [{
      sbe1Id: summary.sbe1_id,
      sbe1Name: summary.sbe1_name,
      to: summary.champion_email,
      subject: `[Action required] ${plural(summary.pending_part_count, 'RA part')} pending for ${summary.sbe1_name}`,
      pendingPartCount: summary.pending_part_count,
      pendingPcnCount: summary.pending_pcn_count,
      text: `Dear ${summary.sbe1_name} team,\n\nCSC's current records show ${plural(summary.pending_part_count, 'part')} across ${plural(summary.pending_pcn_count, 'PCN')} still pending risk assessment (RA) from your SBE-1. Please provide the outstanding RAs as soon as possible.\n\nCurrent pending RA overview for all SBE-1 teams:\n${overviewText}\n\nYour pending items:\n${detailText}\n\nThese counts are generated from the live PCN database and change when CSC records an RA as acquired.\n\nThank you,\nCSC`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:900px"><p>Dear <strong>${escapeHtml(summary.sbe1_name)}</strong> team,</p><p>CSC's current records show <strong style="color:#b91c1c">${plural(summary.pending_part_count, 'part')}</strong> across <strong>${plural(summary.pending_pcn_count, 'PCN')}</strong> still pending risk assessment (RA) from your SBE-1. Please provide the outstanding RAs as soon as possible.</p><h3>Current pending RA overview — all SBE-1 teams</h3>${summaryTable(summaries, summary.sbe1_id)}<h3>Your pending items</h3><table role="presentation" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px"><thead><tr style="background:#111827;color:#fff"><th style="padding:8px;text-align:left">TI Part Number</th><th style="padding:8px;text-align:left">TI PCN Number</th><th style="padding:8px;text-align:left">Corresponding PCN Title</th></tr></thead><tbody>${detailHtml}</tbody></table><p style="color:#4b5563;font-size:12px">These counts are generated from the live PCN database and change when CSC records an RA as acquired.</p><p>Thank you,<br>CSC</p></div>`
    }]
  })
  return {
    generatedAt: new Date().toISOString(),
    totalPendingParts: new Set(pendingRows.map(row => row.ti_part_id)).size,
    totalPendingPcns: new Set(pendingRows.map(row => row.pcn_id)).size,
    missingChampionEmails: summaries.filter(row => row.pending_part_count > 0 && !row.champion_email).map(row => ({ sbe1Id: row.sbe1_id, sbe1Name: row.sbe1_name, pendingPartCount: row.pending_part_count })),
    summary: summaries.map(row => ({ sbe1Id: row.sbe1_id, sbe1Name: row.sbe1_name, pendingPartCount: row.pending_part_count, pendingPcnCount: row.pending_pcn_count })),
    emails
  }
}
