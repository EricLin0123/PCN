import { all, get } from '../../../utils/db'
import { pendingDocumentsCte } from '../../../utils/pendingDocuments'

interface PendingRow {
  pcn_id: number
  pcn_number_base: string
  title: string
  notification_date: string | null
  ti_part_id: number
  display_part_number: string
  industry: string | null
}

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const sbe1 = Number.isInteger(id)
    ? get<{ id: number, name: string }>('SELECT id, name FROM sbe1 WHERE id = ?', id)
    : undefined
  if (!sbe1) throw createError({ statusCode: 404, statusMessage: 'SBE-1 not found.' })

  const query = getQuery(event)
  const documentType = String(query.documentType || '').toUpperCase()
  const groupBy = String(query.groupBy || '').toLowerCase()
  if (!['RA', 'PPAP'].includes(documentType) || !['part', 'pcn'].includes(groupBy)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose RA or PPAP and group by part or PCN.' })
  }

  const rows = all<PendingRow>(`${pendingDocumentsCte}
    SELECT pending.pcn_id, pcn.pcn_number_base, pcn.title, pcn.notification_date,
      pending.ti_part_id, part.display_part_number, part.industry
    FROM pending
    JOIN pcn ON pcn.id = pending.pcn_id
    JOIN ti_part part ON part.id = pending.ti_part_id
    WHERE pending.sbe1_id = ? AND pending.document_type = ?
    ORDER BY part.normalized_part_number, pcn.notification_date DESC, pcn.pcn_number_base DESC`, id, documentType)

  if (groupBy === 'part') {
    const items = new Map<number, any>()
    for (const row of rows) {
      if (!items.has(row.ti_part_id)) {
        items.set(row.ti_part_id, {
          id: row.ti_part_id,
          partNumber: row.display_part_number,
          industry: row.industry,
          pcns: []
        })
      }
      items.get(row.ti_part_id).pcns.push({
        id: row.pcn_id,
        number: row.pcn_number_base,
        title: row.title,
        notificationDate: row.notification_date
      })
    }
    return { sbe1, documentType, groupBy, items: [...items.values()] }
  }

  const items = new Map<number, any>()
  for (const row of rows) {
    if (!items.has(row.pcn_id)) {
      items.set(row.pcn_id, {
        id: row.pcn_id,
        number: row.pcn_number_base,
        title: row.title,
        notificationDate: row.notification_date,
        parts: []
      })
    }
    items.get(row.pcn_id).parts.push({
      id: row.ti_part_id,
      partNumber: row.display_part_number,
      industry: row.industry
    })
  }
  return { sbe1, documentType, groupBy, items: [...items.values()] }
})
