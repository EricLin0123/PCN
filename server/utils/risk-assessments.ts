import { get, run, useDatabase } from './db'

export function normalizeRaParts(value: unknown): string[] {
  const source = Array.isArray(value) ? value.join(';') : String(value || '')
  return [...new Set(source.split(/[;\r\n]+/).map(part => part.trim().toUpperCase()).filter(Boolean))]
}

export function assertPcnParts(pcnId: number, parts: string[]) {
  if (!parts.length) throw createError({ statusCode: 400, statusMessage: 'At least one TI part is required.' })
  const ids: number[] = []
  for (const part of parts) {
    const match = get<{ id: number }>(`SELECT tp.id FROM ti_part tp JOIN pcn_ti_part pp ON pp.ti_part_id = tp.id
      WHERE pp.pcn_id = ? AND tp.normalized_part_number = ?`, pcnId, part)
    if (!match) throw createError({ statusCode: 400, statusMessage: `${part} is not an authoritative TI affected part for this PCN.` })
    ids.push(match.id)
  }
  return ids
}

export function replaceRaParts(assessmentId: number, partIds: number[]) {
  run('DELETE FROM risk_assessment_ti_part WHERE risk_assessment_id = ?', assessmentId)
  for (const partId of partIds) run('INSERT INTO risk_assessment_ti_part(risk_assessment_id, ti_part_id) VALUES (?, ?)', assessmentId, partId)
}

export function transaction<T>(callback: () => T) {
  const db = useDatabase()
  db.exec('BEGIN IMMEDIATE')
  try { const result = callback(); db.exec('COMMIT'); return result }
  catch (error) { db.exec('ROLLBACK'); throw error }
}
