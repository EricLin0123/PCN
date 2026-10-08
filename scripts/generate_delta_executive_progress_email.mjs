import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputName = process.argv[2] || 'Update_to_Delta.eml'
const outputPath = resolve(outputName.endsWith('.eml') ? outputName : `${outputName}.eml`)
const databasePath = resolve(process.env.PCN_DB_PATH || 'data/pcn.db')
const db = new DatabaseSync(databasePath, { readOnly: true })

const definitions = [
  { key: 'MINOR_PENDING_UPLOAD', owner: 'TI', status: 'Minor pending upload', definition: 'MINOR PCN with at least one affected material pending upload', action: 'Upload to Delta', background: '#fff000', foreground: '#000000' },
  { key: 'MAJOR_PENDING_UPLOAD', owner: 'TI', status: 'Major pending upload', definition: 'MAJOR PCN with at least one affected material pending upload; document progress is tracked in the RA and PPAP columns', action: 'Complete documents and upload', background: '#fff000', foreground: '#000000' },
  { key: 'MINOR_PENDING_APPROVAL', owner: 'Delta', status: 'Minor pending approval', definition: 'Delta PROCESSING; expected TI risk MINOR', action: 'Follow up with Delta', background: '#73cfff', foreground: '#000000' },
  { key: 'MAJOR_PENDING_APPROVAL', owner: 'Delta', status: 'Major pending approval', definition: 'Delta PROCESSING; expected TI risk MAJOR', action: 'Follow up with Delta', background: '#73cfff', foreground: '#000000' },
  { key: 'REJECTED', owner: 'TI / Delta', status: 'Rejected – resolution required', definition: 'At least one suffix has REJECT as its latest Delta attempt', action: 'Investigate and correct', background: '#f00000', foreground: '#ffffff' },
  { key: 'COMPLETED', owner: 'Closed', status: 'Completed', definition: 'Latest Delta status is COMPLETE; MINOR and MAJOR PCNs do not require full upload or RA coverage', action: 'No action', background: '#00ed4b', foreground: '#000000' },
  { key: 'EOL_EXCLUDED', owner: 'Closed', status: 'EOL / Excluded', definition: 'Expected TI risk is EOL', action: 'No action', background: '#000000', foreground: '#ffffff' },
]

const counts = new Map(db.prepare(`
  SELECT executive_state AS key, count(*) AS value
  FROM pcn_executive_status
  GROUP BY executive_state
`).all().map(row => [row.key, Number(row.value)]))
db.close()

const queues = definitions.map(queue => ({ ...queue, value: counts.get(queue.key) || 0 }))
const generatedAt = new Date()
const date = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Taipei',
}).format(generatedAt)
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const cell = 'border:1px solid #657484;padding:9px 10px;vertical-align:middle;'
const rows = queues.map(queue => `<tr>
  <td style="${cell}font-weight:700">${escapeHtml(queue.owner)}</td>
  <td style="${cell}background:${queue.background};color:${queue.foreground};font-weight:700">${escapeHtml(queue.status)}</td>
  <td style="${cell}">${escapeHtml(queue.definition)}</td>
  <td align="center" style="${cell}background:${queue.background};color:${queue.foreground};font-size:18px;font-weight:700">${queue.value.toLocaleString('en-US')}</td>
  <td style="${cell}font-weight:700">${escapeHtml(queue.action)}</td>
</tr>`).join('')
const body = `<div style="max-width:1100px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124">
  <p>Dear Delta team,</p>
  <p>Please find below our latest progress in digesting TI PCNs. The figures are generated from the live PCN database.</p>
  <p>TI is working diligently to provide the required documents. We kindly ask Delta to act on PCNs pending on the Delta side and review rejected PCNs to determine whether documents must be re-uploaded or whether the rejection resulted from an extended pending period. In the latter case, please reassess the rejected PCN.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#202124">
    <thead><tr style="background:#7f8d9c;color:#ffffff"><th align="left" style="${cell}">Owner</th><th align="left" style="${cell}">Status</th><th align="left" style="${cell}">Definition</th><th align="center" style="${cell}">PCNs</th><th align="left" style="${cell}">Action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#5f6368;font-size:12px">Snapshot generated from the live database on ${escapeHtml(date)}.</p>
  <p>Best regards,<br>TI Sales</p>
</div>`
const subject = `[TI PCN Progress] Executive dashboard - ${date}`
const eml = `Subject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`

writeFileSync(outputPath, eml)
console.log(JSON.stringify({ outputPath, generatedAt: generatedAt.toISOString(), rows: queues.length, totalPcns: queues.reduce((sum, queue) => sum + queue.value, 0), counts: Object.fromEntries(queues.map(queue => [queue.key, queue.value])) }, null, 2))
