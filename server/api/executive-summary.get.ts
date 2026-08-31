import { all, get } from '../utils/db'

const definitions = [
  { key: 'MINOR_READY_UPLOAD', owner: 'TI', status: 'Minor ready for upload', definition: 'MINOR PCN with at least one affected material pending upload', action: 'Upload to Delta', tone: 'yellow' },
  { key: 'MAJOR_BLOCKED_RA', owner: 'TI', status: 'Major blocked by RA', definition: 'MAJOR PCN pending upload without full material-level RA coverage', action: 'Complete / Verify RA', tone: 'red' },
  { key: 'MAJOR_READY_UPLOAD', owner: 'TI', status: 'Major ready for upload', definition: 'MAJOR PCN pending upload with full material-level RA coverage', action: 'Upload with RA', tone: 'yellow' },
  { key: 'MINOR_PENDING_APPROVAL', owner: 'Delta', status: 'Minor pending approval', definition: 'Delta PROCESSING; expected TI risk MINOR', action: 'Follow up with Delta', tone: 'yellow' },
  { key: 'MAJOR_PENDING_APPROVAL', owner: 'Delta', status: 'Major pending approval', definition: 'Delta PROCESSING; expected TI risk MAJOR', action: 'Follow up with Delta', tone: 'yellow' },
  { key: 'REJECTED', owner: 'TI / Delta', status: 'Rejected – resolution required', definition: 'At least one suffix has REJECT as its latest Delta attempt', action: 'Investigate and correct', tone: 'red' },
  { key: 'COMPLETED', owner: 'Closed', status: 'Completed', definition: 'Latest Delta status is COMPLETE; MINOR and MAJOR PCNs do not require full upload or RA coverage', action: 'No action', tone: 'green' },
  { key: 'EOL_EXCLUDED', owner: 'Closed', status: 'EOL / Excluded', definition: 'Expected TI risk is EOL', action: 'No action', tone: 'black' },
]

export default defineEventHandler(() => {
  const counts = new Map(all<{ key: string; value: number }>(
    'SELECT executive_state AS key, count(*) AS value FROM pcn_executive_status GROUP BY executive_state',
  ).map(item => [item.key, item.value]))
  const queues = definitions.map(item => ({ ...item, value: counts.get(item.key) || 0 }))
  const riskMismatch = get<{ value: number }>(
    "SELECT count(*) AS value FROM pcn_operational_status WHERE risk_alignment = 'MISMATCH'",
  )?.value || 0
  return { queues, riskMismatch, other: counts.get('OTHER') || 0, total: queues.reduce((sum, item) => sum + item.value, 0) }
})
