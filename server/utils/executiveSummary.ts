import { all, get } from './db'

export interface ExecutiveQueue {
  key: string
  owner: string
  status: string
  definition: string
  action: string
  tone: string
  value: number
}

export const executiveQueueDefinitions = [
  { key: 'NO_12M_SALES', owner: 'TI', status: 'No 12M sales', definition: 'PCN with 0 NR from Aug 2025 through today, reassigned from an upload queue', action: 'Review sales exposure', tone: 'black' },
  { key: 'MINOR_PENDING_UPLOAD', owner: 'TI', status: 'Minor pending upload', definition: 'MINOR PCN with at least one affected material pending upload', action: 'Upload to Delta', tone: 'yellow' },
  { key: 'MAJOR_PENDING_UPLOAD', owner: 'TI', status: 'Major pending upload', definition: 'MAJOR PCN with at least one affected material pending upload; document progress is tracked in the RA and PPAP columns', action: 'Complete documents and upload', tone: 'yellow' },
  { key: 'MINOR_PENDING_APPROVAL', owner: 'Delta', status: 'Minor pending approval', definition: 'Delta PROCESSING; expected TI risk MINOR', action: 'Follow up with Delta', tone: 'yellow' },
  { key: 'MAJOR_PENDING_APPROVAL', owner: 'Delta', status: 'Major pending approval', definition: 'Delta PROCESSING; expected TI risk MAJOR', action: 'Follow up with Delta', tone: 'yellow' },
  { key: 'REJECTED', owner: 'TI / Delta', status: 'Rejected – resolution required', definition: 'At least one suffix has REJECT as its latest Delta attempt', action: 'Investigate and correct', tone: 'red' },
  { key: 'COMPLETED', owner: 'Closed', status: 'Completed', definition: 'Latest Delta status is COMPLETE; MINOR and MAJOR PCNs do not require full upload or RA coverage', action: 'No action', tone: 'green' },
  { key: 'EOL_EXCLUDED', owner: 'Closed', status: 'EOL / Excluded', definition: 'Expected TI risk is EOL', action: 'No action', tone: 'black' },
] as const

export function getExecutiveQueues(): ExecutiveQueue[] {
  const counts = new Map(all<{ key: string, value: number }>(
    'SELECT executive_state AS key, count(*) AS value FROM pcn_executive_status GROUP BY executive_state',
  ).map(item => [item.key, Number(item.value)]))
  return executiveQueueDefinitions.map(item => ({ ...item, value: counts.get(item.key) || 0 }))
}

export function getRiskMismatchCount() {
  return Number(get<{ value: number }>(
    "SELECT count(*) AS value FROM pcn_operational_status WHERE risk_alignment = 'MISMATCH'",
  )?.value || 0)
}
