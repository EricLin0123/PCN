import { all, get } from '../utils/db'
import { getExecutiveQueues, getRiskMismatchCount } from '../utils/executiveSummary'

export default defineEventHandler(() => {
  const revenueFrom = '2025-08'
  const revenueTo = '2026-09'
  const queues = getExecutiveQueues()
  const riskMismatch = getRiskMismatchCount()
  const revenueRows = all<{ key: string; pcn_number: string; net_revenue: number }>(`SELECT
      ex.executive_state AS key,
      p.pcn_number_base AS pcn_number,
      sum(mmr.net_revenue) AS net_revenue
    FROM pcn_executive_status ex
    JOIN pcn p ON p.id = ex.pcn_id
    JOIN pcn_ti_part pp ON pp.pcn_id = p.id
    JOIN ti_part tp ON tp.id = pp.ti_part_id
    JOIN material_month_revenue mmr ON mmr.normalized_part_number = tp.normalized_part_number
      AND mmr.revenue_month BETWEEN ? AND ?
    WHERE ex.executive_state IN ('MINOR_PENDING_UPLOAD', 'MAJOR_PENDING_UPLOAD')
    GROUP BY ex.executive_state, p.id
    HAVING sum(mmr.net_revenue) > 0
    ORDER BY ex.executive_state, net_revenue DESC, p.pcn_number_base`, revenueFrom, revenueTo)
  const revenueBreakdowns: Record<string, Array<{ pcnNumber: string; netRevenue: number }>> = {
    MINOR_PENDING_UPLOAD: [],
    MAJOR_PENDING_UPLOAD: [],
  }
  for (const row of revenueRows) {
    revenueBreakdowns[row.key]?.push({ pcnNumber: row.pcn_number, netRevenue: Number(row.net_revenue) })
  }
  return {
    queues,
    riskMismatch,
    revenueBreakdowns,
    revenuePeriod: { from: revenueFrom, to: revenueTo },
    other: get<{ value: number }>("SELECT count(*) AS value FROM pcn_executive_status WHERE executive_state = 'OTHER'")?.value || 0,
    total: queues.reduce((sum, item) => sum + item.value, 0),
  }
})
