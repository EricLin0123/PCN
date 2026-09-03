import { get, run } from './db'

export function assertAutomotivePcnParts(pcnId: number, parts: string[]) {
  if (!parts.length) throw createError({ statusCode: 400, statusMessage: 'At least one automotive TI part is required.' })
  return parts.map((part) => {
    const match = get<{ id: number }>(`SELECT tp.id FROM ti_part tp
      JOIN pcn_ti_part affected ON affected.ti_part_id = tp.id
      WHERE affected.pcn_id = ? AND tp.normalized_part_number = ?
        AND lower(trim(COALESCE(tp.industry, ''))) = 'automotive'`, pcnId, part)
    if (!match) throw createError({ statusCode: 400, statusMessage: `${part} is not an automotive affected part for this PCN.` })
    return match.id
  })
}

export function replacePpapParts(ppapId: number, partIds: number[]) {
  run('DELETE FROM ppap_ti_part WHERE ppap_id = ?', ppapId)
  for (const partId of partIds) run('INSERT INTO ppap_ti_part(ppap_id, ti_part_id) VALUES (?, ?)', ppapId, partId)
}
