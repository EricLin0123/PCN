import { all, get } from '../utils/db'

interface OrganizationRow {
  sbe_id: number
  sbe_name: string
  sbe1_id: number
  sbe1_name: string
  champion_email: string | null
  sbe2_id: number
  sbe2_name: string
  part_count: number
}

interface Sbe2Node {
  id: number
  name: string
  partCount: number
}

interface Sbe1Node {
  id: number
  name: string
  championEmail: string | null
  partCount: number
  sbe2: Sbe2Node[]
}

interface SbeNode {
  id: number | null
  name: string
  partCount: number
  sbe1: Sbe1Node[]
}

export default defineEventHandler(() => {
  const rows = all<OrganizationRow>(`SELECT
      sbe.id AS sbe_id,
      sbe.name AS sbe_name,
      sbe1.id AS sbe1_id,
      sbe1.name AS sbe1_name,
      sbe1.champion_email,
      sbe2.id AS sbe2_id,
      sbe2.name AS sbe2_name,
      count(DISTINCT organization.ti_part_id) AS part_count
    FROM ti_part_organization organization
    JOIN sbe ON sbe.id = organization.sbe_id
    JOIN sbe1 ON sbe1.id = organization.sbe1_id
    JOIN sbe2 ON sbe2.id = organization.sbe2_id
    GROUP BY sbe.id, sbe1.id, sbe2.id
    ORDER BY sbe.name, sbe1.name, sbe2.name`)

  const hierarchy = new Map<number, SbeNode>()
  const sbe1Nodes = new Map<string, Sbe1Node>()

  for (const row of rows) {
    if (!hierarchy.has(row.sbe_id)) {
      hierarchy.set(row.sbe_id, { id: row.sbe_id, name: row.sbe_name, partCount: 0, sbe1: [] })
    }
    const sbe = hierarchy.get(row.sbe_id)!
    const sbe1Key = `${row.sbe_id}:${row.sbe1_id}`
    if (!sbe1Nodes.has(sbe1Key)) {
      const node: Sbe1Node = {
        id: row.sbe1_id,
        name: row.sbe1_name,
        championEmail: row.champion_email,
        partCount: 0,
        sbe2: []
      }
      sbe1Nodes.set(sbe1Key, node)
      sbe.sbe1.push(node)
    }
    const sbe1 = sbe1Nodes.get(sbe1Key)!
    const partCount = Number(row.part_count)
    sbe1.sbe2.push({ id: row.sbe2_id, name: row.sbe2_name, partCount })
    sbe1.partCount += partCount
    sbe.partCount += partCount
  }

  const unmapped = all<{ id: number, name: string, champion_email: string | null }>(`SELECT
      sbe1.id, sbe1.name, sbe1.champion_email
    FROM sbe1
    WHERE NOT EXISTS (
      SELECT 1 FROM ti_part_organization organization WHERE organization.sbe1_id = sbe1.id
    )
    ORDER BY sbe1.name`)

  const organizations = [...hierarchy.values()]
  if (unmapped.length) {
    organizations.push({
      id: null,
      name: 'Unmapped',
      partCount: 0,
      sbe1: unmapped.map(item => ({
        id: item.id,
        name: item.name,
        championEmail: item.champion_email,
        partCount: 0,
        sbe2: []
      }))
    })
  }

  const totals = get<{
    sbe_count: number
    sbe1_count: number
    sbe2_count: number
    part_count: number
  }>(`SELECT
      (SELECT count(*) FROM sbe) AS sbe_count,
      (SELECT count(*) FROM sbe1) AS sbe1_count,
      (SELECT count(*) FROM sbe2) AS sbe2_count,
      (SELECT count(*) FROM ti_part_organization) AS part_count`)

  return { organizations, totals }
})
