import { getExecutiveQueues } from './executiveSummary'

const excludedQueue = 'NO_12M_SALES'
const colors: Record<string, { background: string, foreground: string }> = {
  red: { background: '#f00000', foreground: '#ffffff' },
  yellow: { background: '#fff000', foreground: '#000000' },
  green: { background: '#00ed4b', foreground: '#000000' },
  black: { background: '#000000', foreground: '#ffffff' },
}

const deltaHighlight = { background: '#73cfff', foreground: '#000000' }

function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function emailTable(queues: ReturnType<typeof getExecutiveQueues>) {
  const cells = 'border:1px solid #657484;padding:9px 10px;vertical-align:middle;'
  const rows = queues.map((queue) => {
    const color = queue.owner === 'Delta'
      ? deltaHighlight
      : colors[queue.tone] || { background: '#000000', foreground: '#ffffff' }
    return `<tr>
      <td style="${cells}font-weight:700">${escapeHtml(queue.owner)}</td>
      <td style="${cells}background:${color.background};color:${color.foreground};font-weight:700">${escapeHtml(queue.status)}</td>
      <td style="${cells}">${escapeHtml(queue.definition)}</td>
      <td align="center" style="${cells}background:${color.background};color:${color.foreground};font-size:18px;font-weight:700">${queue.value.toLocaleString('en-US')}</td>
      <td style="${cells}font-weight:700">${escapeHtml(queue.action)}</td>
    </tr>`
  }).join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#202124">
    <thead><tr style="background:#7f8d9c;color:#ffffff">
      <th align="left" style="${cells}">Owner</th><th align="left" style="${cells}">Status</th><th align="left" style="${cells}">Definition</th><th align="center" style="${cells}">PCNs</th><th align="left" style="${cells}">Action</th>
    </tr></thead><tbody>${rows}</tbody>
  </table>`
}

export function generateDeltaExecutiveProgressEmail() {
  const generatedAt = new Date()
  const queues = getExecutiveQueues().filter(queue => queue.key !== excludedQueue)
  const total = queues.reduce((sum, queue) => sum + queue.value, 0)
  const date = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Taipei' }).format(generatedAt)
  const textRows = queues.map(queue => `${queue.owner} | ${queue.status} | ${queue.definition} | ${queue.value} | ${queue.action}`).join('\n')
  const intro = 'Please find below our latest progress in digesting TI PCNs. The figures are generated from the live PCN database.'
  const actionRequest = 'TI is working diligently to provide the required documents. We kindly ask Delta to act on PCNs pending on the Delta side and review rejected PCNs to determine whether documents must be re-uploaded or whether the rejection resulted from an extended pending period. In the latter case, please reassess the rejected PCN.'

  return {
    generatedAt: generatedAt.toISOString(),
    subject: `[TI PCN Progress] Executive dashboard - ${date}`,
    rowCount: queues.length,
    totalPcns: total,
    excluded: ['No 12M sales'],
    queues,
    text: `Dear Delta team,\n\n${intro}\n\n${actionRequest}\n\nOwner | Status | Definition | PCNs | Action\n${textRows}\n\nSnapshot generated: ${date}\n\nBest regards,\nTI Sales`,
    html: `<div style="max-width:1100px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124"><p>Dear Delta team,</p><p>${intro}</p><p>${actionRequest}</p>${emailTable(queues)}<p style="color:#5f6368;font-size:12px">Snapshot generated from the live database on ${escapeHtml(date)}.</p><p>Best regards,<br>TI Sales</p></div>`,
  }
}
