<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const search = ref(String(route.query.search || ''))
const risk = ref(String(route.query.risk || ''))
const statusFilter = ref(String(route.query.status || ''))
const uploadState = ref(String(route.query.uploadState || ''))
const riskAlignment = ref(String(route.query.riskAlignment || ''))
const raState = ref(String(route.query.raState || ''))
const changeType = ref(String(route.query.changeType || ''))
const executiveState = ref(String(route.query.executiveState || ''))
const revenueFrom = ref(String(route.query.revenueFrom || '2025-08'))
const revenueTo = ref(String(route.query.revenueTo || '2026-08'))
const isRevenuePriorityQueue = computed(() => ['MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA', 'MAJOR_READY_UPLOAD'].includes(executiveState.value))
const isMinorRevenuePriorityQueue = computed(() => executiveState.value === 'MINOR_READY_UPLOAD')
const revenueChartTitle = computed(() => executiveState.value === 'MINOR_READY_UPLOAD' ? 'Minor ready for upload' : 'Major blocked by RA')
const exporting = ref(false)
const exportError = ref('')
const query = computed(() => ({ search: String(route.query.search || ''), risk: String(route.query.risk || ''), status: String(route.query.status || ''), uploadState: String(route.query.uploadState || ''), riskAlignment: String(route.query.riskAlignment || ''), raState: String(route.query.raState || ''), changeType: String(route.query.changeType || ''), executiveState: String(route.query.executiveState || ''), revenueFrom: String(route.query.revenueFrom || '2025-08'), revenueTo: String(route.query.revenueTo || '2026-08'), pageSize: 'all' }))
const { data, status, refresh } = await useFetch<any>('/api/pcns', { query, watch: [query] })
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
const revenueChartItems = computed(() => (data.value?.items || [])
  .filter((pcn: any) => Number(pcn.net_revenue) > 0)
  .map((pcn: any) => ({ pcnNumber: String(pcn.pcn_number_base), netRevenue: Number(pcn.net_revenue) })))
let timer: ReturnType<typeof setTimeout>
function activeFilters() {
  return { ...(search.value && { search: search.value }), ...(changeType.value && { changeType: changeType.value }), ...(risk.value && { risk: risk.value }), ...(statusFilter.value && { status: statusFilter.value }), ...(uploadState.value && { uploadState: uploadState.value }), ...(riskAlignment.value && { riskAlignment: riskAlignment.value }), ...(raState.value && { raState: raState.value }), ...(executiveState.value && { executiveState: executiveState.value }), ...(isRevenuePriorityQueue.value && { revenueFrom: revenueFrom.value, revenueTo: revenueTo.value }) }
}
function applyFilters() {
  clearTimeout(timer)
  timer = setTimeout(() => router.push({ query: activeFilters() }), 200)
}

const exportFill: Record<string, string> = {
  MAJOR: 'FFFF0000', MINOR: 'FFFFFF00', EOL: 'FF9900FF', UNKNOWN: 'FFC8C8C8',
  ALL_UPLOADED: 'FF00F04B', PARTLY_UPLOADED: 'FFFFFF00', NOT_UPLOADED: 'FFFF0000',
  COMPLETE: 'FF00F04B', PROCESSING: 'FFFFFF00', REJECT: 'FFFF0000', CANCEL: 'FF000000', MIXED: 'FFFF7900', BLANK: 'FFB8B8B8',
  MATCH: 'FF00F04B', MISMATCH: 'FFFF008C', NOT_ON_DELTA: 'FFB8B8B8', NOT_APPLICABLE: 'FFB8B8B8',
  FULL_RA: 'FF00F04B', PARTLY_MISS_RA: 'FFFFFF00', MISS_ALL_RA: 'FFFF0000', NA: 'FF000000',
}

function displayState(value: string) {
  return value === 'NA' ? '' : value.replaceAll('_', ' ')
}

async function exportToExcel() {
  if (exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    clearTimeout(timer)
    await router.push({ query: activeFilters() })
    await refresh()
    if (!data.value?.items?.length) return

    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'PCN Workbench'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('PCN Records', { views: [{ state: 'frozen', ySplit: 1 }] })
    sheet.columns = [
      { header: 'PCN Number', key: 'pcn', width: 18 },
      { header: 'Title', key: 'title', width: 55 },
      { header: 'TI Affected Parts', key: 'tiAffectedParts', width: 55 },
      { header: 'Delta Received Parts', key: 'deltaReceivedParts', width: 55 },
      { header: 'Missed Parts', key: 'missedParts', width: 55 },
      { header: 'Change Type', key: 'changeType', width: 32 },
      { header: 'Expected Risk', key: 'risk', width: 17 },
      { header: 'Upload State', key: 'uploadState', width: 22 },
      { header: 'Uploaded Parts', key: 'uploadedParts', width: 16 },
      { header: 'Delta-Relevant Parts', key: 'totalParts', width: 20 },
      { header: 'Delta Status', key: 'deltaStatus', width: 18 },
      { header: 'Risk Alignment', key: 'riskAlignment', width: 20 },
      { header: 'Delta Risk', key: 'deltaRisk', width: 18 },
      { header: 'RA Coverage', key: 'raState', width: 20 },
      { header: 'RA Covered Parts', key: 'raCoveredParts', width: 18 },
      { header: `NR (${data.value.revenueFrom} to ${data.value.revenueTo})`, key: 'netRevenue', width: 24 },
    ]
    sheet.getRow(1).height = 24
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2940' } }
    })

    for (const pcn of data.value.items) {
      const row = sheet.addRow({
        pcn: String(pcn.pcn_number_base),
        title: pcn.title,
        tiAffectedParts: isMinorRevenuePriorityQueue.value ? (pcn.ti_affected_parts_with_revenue || '') : (pcn.ti_affected_parts || ''),
        deltaReceivedParts: pcn.delta_received_parts || '',
        missedParts: pcn.missed_parts || '',
        changeType: pcn.change_type || 'Unspecified',
        risk: displayState(pcn.risk),
        uploadState: displayState(pcn.upload_state),
        uploadedParts: pcn.uploaded_parts,
        totalParts: pcn.delta_relevant_parts,
        deltaStatus: displayState(pcn.delta_status),
        riskAlignment: displayState(pcn.risk_alignment),
        deltaRisk: pcn.delta_risks || '',
        raState: displayState(pcn.ra_state),
        raCoveredParts: pcn.ra_state === 'NA' ? '' : pcn.ra_covered_parts,
        netRevenue: pcn.net_revenue,
      })
      row.getCell(1).numFmt = '@'
      row.getCell(3).numFmt = '@'
      row.getCell(4).numFmt = '@'
      row.getCell(5).numFmt = '@'
      for (const [column, state] of [[7, pcn.risk], [8, pcn.upload_state], [11, pcn.delta_status], [12, pcn.risk_alignment], [14, pcn.ra_state]] as const) {
        const cell = row.getCell(column)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: exportFill[state] || 'FFFFFFFF' } }
        cell.font = { bold: true, color: { argb: ['MAJOR', 'REJECT', 'CANCEL', 'MISMATCH', 'MISS_ALL_RA', 'NA'].includes(state) ? 'FFFFFFFF' : 'FF000000' } }
      }
    }

    sheet.autoFilter = { from: 'A1', to: 'P1' }
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.height = 21
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: false }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFB8C2CC' } }, right: { style: 'thin', color: { argb: 'FFB8C2CC' } } }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const scope = executiveState.value ? `-${executiveState.value.toLowerCase().replaceAll('_', '-')}` : ''
    link.download = `pcn-records${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : 'Excel export failed.'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header"><div><p class="eyebrow">Database</p><h1>PCN records</h1><p>Search authoritative TI parts, notification details, and Delta workflow.</p></div><div class="page-actions"><button class="button export-button" :disabled="!data?.items?.length || status === 'pending' || exporting" @click="exportToExcel"><Icon :name="exporting ? 'lucide:loader-circle' : 'lucide:file-spreadsheet'" :class="{ spin: exporting }" /> {{ exporting ? 'Exporting…' : 'Export to Excel' }}</button><NuxtLink to="/pcns/new" class="button primary"><Icon name="lucide:plus" /> Add PCN</NuxtLink></div></header>
    <div v-if="exportError" class="alert error export-error">{{ exportError }}</div>
    <section class="panel list-panel">
      <div class="list-meta"><span v-if="data"><strong>{{ data.total.toLocaleString() }}</strong> records <template v-if="executiveState">· Executive queue: <strong>{{ executiveState.replaceAll('_', ' ') }}</strong> <NuxtLink to="/pcns" class="clear-filter">Clear</NuxtLink></template></span><span v-if="status === 'pending'" class="muted"><Icon name="lucide:loader-circle" class="spin" /> Updating</span></div>
      <div v-if="isRevenuePriorityQueue" class="revenue-period">
        <strong>Priority by NR</strong>
        <label>From <input v-model="revenueFrom" type="month" @change="applyFilters()" /></label>
        <label>To <input v-model="revenueTo" type="month" @change="applyFilters()" /></label>
        <span>PCNs are ranked by the sum of affected-part NR in this period.</span>
      </div>
      <div v-if="['MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA'].includes(executiveState)" class="queue-revenue-chart">
        <ExecutiveRevenuePie :title="revenueChartTitle" :items="revenueChartItems" />
      </div>
      <div v-if="data?.items.length" class="table-wrap"><table class="records-table" :class="{ 'major-revenue-priority-table': ['MAJOR_BLOCKED_RA', 'MAJOR_READY_UPLOAD'].includes(executiveState) }">
        <thead><tr>
          <th><span class="column-heading">PCN / title / part / RA</span><input v-model="search" class="column-filter" placeholder="Search PCN or part…" @input="applyFilters()" /></th>
          <th><span class="column-heading">Change type</span><select v-model="changeType" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option v-for="type in changeTypes" :key="type.id" :value="type.name">{{ type.name }}</option></select></th>
          <th><span class="column-heading">Expected risk</span><select v-model="risk" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option>MAJOR</option><option>MINOR</option><option>EOL</option><option>UNKNOWN</option></select></th>
          <th><span class="column-heading">Upload state</span><select v-model="uploadState" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="ALL_UPLOADED">All uploaded</option><option value="PARTLY_UPLOADED">Partly uploaded</option><option value="NOT_UPLOADED">Not uploaded</option></select></th>
          <th><span class="column-heading">Delta status</span><select v-model="statusFilter" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option>CANCEL</option><option>PROCESSING</option><option>REJECT</option><option>COMPLETE</option><option>MIXED</option><option value="BLANK">Blank</option></select></th>
          <th><span class="column-heading">Risk alignment</span><select v-model="riskAlignment" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="MISMATCH">Mismatch</option><option value="MATCH">Match</option><option value="NOT_ON_DELTA">Not on Delta</option><option value="NOT_APPLICABLE">Not applicable</option></select></th>
          <th v-if="!isMinorRevenuePriorityQueue"><span class="column-heading">RA coverage</span><select v-model="raState" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="FULL_RA">Full RA</option><option value="PARTLY_MISS_RA">Partly Miss RA</option><option value="MISS_ALL_RA">Miss all RA</option><option value="NA">NA</option></select></th>
          <th v-if="isRevenuePriorityQueue"><span class="column-heading">NR {{ revenueFrom }}–{{ revenueTo }}</span></th>
        </tr></thead>
        <tbody><tr v-for="pcn in data.items" :key="pcn.id">
          <td><NuxtLink :to="{ path: `/pcns/${pcn.id}`, query: isRevenuePriorityQueue ? { revenueFrom, revenueTo } : {} }" class="record-title"><span class="mono-link">{{ pcn.pcn_number_base }}</span><small>{{ pcn.title }}</small><small v-if="isMinorRevenuePriorityQueue" class="coverage-count">TI affected parts · NR: {{ pcn.ti_affected_parts_with_revenue }}</small></NuxtLink></td>
          <td>{{ pcn.change_type || 'Unspecified' }}</td><td class="fill-cell" :class="`fill-${pcn.risk.toLowerCase()}`"><RiskBadge :risk="pcn.risk" /></td>
          <td class="fill-cell" :class="`fill-${pcn.upload_state.toLowerCase().replaceAll('_', '-')}`"><StateBadge :state="pcn.upload_state" /><small class="coverage-count">{{ pcn.uploaded_parts }}/{{ pcn.delta_relevant_parts }} Delta parts</small></td>
          <td class="fill-cell delta-status-cell" :class="`fill-delta-${pcn.delta_status.toLowerCase()}`"><strong v-if="pcn.delta_status !== 'BLANK'">{{ pcn.delta_status }}</strong><small v-if="pcn.statuses && pcn.statuses !== pcn.delta_status" class="coverage-count">{{ pcn.statuses }}</small></td>
          <td class="fill-cell" :class="`fill-${pcn.risk_alignment.toLowerCase().replaceAll('_', '-')}`"><StateBadge :state="pcn.risk_alignment" kind="alignment" /><small v-if="pcn.delta_risks" class="coverage-count">Delta: {{ pcn.delta_risks }}</small></td>
          <td v-if="!isMinorRevenuePriorityQueue" class="fill-cell" :class="`fill-ra-${pcn.ra_state.toLowerCase().replaceAll('_', '-')}`"><template v-if="pcn.ra_state !== 'NA'"><StateBadge :state="pcn.ra_state" /><small class="coverage-count">{{ pcn.ra_covered_parts }}/{{ pcn.total_parts }} parts</small></template></td>
          <td v-if="isRevenuePriorityQueue" class="numeric-cell"><strong>{{ pcn.net_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></td>
        </tr></tbody>
      </table></div>
      <EmptyState v-else-if="status !== 'pending'" title="No matching PCNs" text="Adjust the filters or create a new PCN record." icon="lucide:search-x" />
      <div v-else class="table-loading"><div v-for="i in 8" :key="i" class="skeleton row" /></div>
    </section>
  </div>
</template>
