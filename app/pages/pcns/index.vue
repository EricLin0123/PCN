<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const search = ref(String(route.query.search || ''))
const risk = ref(String(route.query.risk || ''))
const statusFilter = ref(String(route.query.status || ''))
const uploadState = ref(String(route.query.uploadState || ''))
const cscStatus = ref(String(route.query.cscStatus || ''))
const riskAlignment = ref(String(route.query.riskAlignment || ''))
const raState = ref(String(route.query.raState || ''))
const changeType = ref(String(route.query.changeType || ''))
const executiveState = ref(String(route.query.executiveState || ''))
const revenueFrom = ref(String(route.query.revenueFrom || '2025-08'))
const revenueTo = ref(String(route.query.revenueTo || '2026-08'))
const isRevenuePriorityQueue = computed(() => ['MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA', 'MAJOR_READY_UPLOAD'].includes(executiveState.value))
const revenueChartTitle = computed(() => executiveState.value === 'MINOR_READY_UPLOAD' ? 'Minor ready for upload' : 'Major blocked by RA')
const exporting = ref(false)
const exportError = ref('')
const nrSort = ref<'asc' | 'desc' | null>(null)
const query = computed(() => ({ search: String(route.query.search || ''), risk: String(route.query.risk || ''), status: String(route.query.status || ''), uploadState: String(route.query.uploadState || ''), cscStatus: String(route.query.cscStatus || ''), riskAlignment: String(route.query.riskAlignment || ''), raState: String(route.query.raState || ''), changeType: String(route.query.changeType || ''), executiveState: String(route.query.executiveState || ''), revenueFrom: String(route.query.revenueFrom || '2025-08'), revenueTo: String(route.query.revenueTo || '2026-08'), pageSize: 'all' }))
const { data, status, refresh } = await useFetch<any>('/api/pcns', { query, watch: [query] })
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
const sortedPcns = computed(() => {
  const items = data.value?.items || []
  if (!nrSort.value) return items
  const direction = nrSort.value === 'asc' ? 1 : -1
  return items
    .map((pcn: any, index: number) => ({ pcn, index }))
    .sort((left: any, right: any) => direction * (Number(left.pcn.net_revenue) - Number(right.pcn.net_revenue)) || left.index - right.index)
    .map(({ pcn }: any) => pcn)
})
const revenueChartItems = computed(() => (data.value?.items || [])
  .filter((pcn: any) => Number(pcn.net_revenue) > 0)
  .map((pcn: any) => ({ id: Number(pcn.id), pcnNumber: String(pcn.pcn_number_base), netRevenue: Number(pcn.net_revenue) })))
let timer: ReturnType<typeof setTimeout>
function activeFilters() {
  return { ...(search.value && { search: search.value }), ...(changeType.value && { changeType: changeType.value }), ...(risk.value && { risk: risk.value }), ...(statusFilter.value && { status: statusFilter.value }), ...(uploadState.value && { uploadState: uploadState.value }), ...(cscStatus.value && { cscStatus: cscStatus.value }), ...(riskAlignment.value && { riskAlignment: riskAlignment.value }), ...(raState.value && { raState: raState.value }), ...(executiveState.value && { executiveState: executiveState.value }), revenueFrom: revenueFrom.value, revenueTo: revenueTo.value }
}

type ColumnKey = 'record' | 'changeType' | 'risk' | 'upload' | 'csc' | 'delta' | 'nr' | 'alignment'
interface TableColumn { key: ColumnKey, label: string, width: number, minWidth: number }
const defaultColumns: TableColumn[] = [
  { key: 'record', label: 'PCN / title / part / RA', width: 400, minWidth: 280 },
  { key: 'changeType', label: 'Change type', width: 210, minWidth: 140 },
  { key: 'risk', label: 'Expected risk level', width: 155, minWidth: 120 },
  { key: 'upload', label: 'Upload state', width: 190, minWidth: 145 },
  { key: 'csc', label: 'CSC uploaded', width: 195, minWidth: 150 },
  { key: 'delta', label: 'Delta status', width: 170, minWidth: 135 },
  { key: 'nr', label: 'NR (net revenue)', width: 180, minWidth: 150 },
  { key: 'alignment', label: 'Risk alignment', width: 190, minWidth: 150 },
]
const columns = ref<TableColumn[]>(defaultColumns.map(column => ({ ...column })))
const draggedColumn = ref<ColumnKey | null>(null)
const tableWidth = computed(() => columns.value.reduce((total, column) => total + column.width, 0))
const storageKey = 'pcn-record-column-layout-v1'
let resizeCleanup: (() => void) | undefined

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    const defaultKeys = defaultColumns.map(column => column.key)
    if (Array.isArray(saved) && saved.length === defaultColumns.length && defaultKeys.every(key => saved.some((column: any) => column.key === key))) {
      columns.value = saved.map((savedColumn: any) => {
        const fallback = defaultColumns.find(column => column.key === savedColumn.key)!
        return { ...fallback, width: Math.max(fallback.minWidth, Number(savedColumn.width) || fallback.width) }
      })
    }
  } catch {
    localStorage.removeItem(storageKey)
  }
})
watch(columns, value => {
  if (import.meta.client) localStorage.setItem(storageKey, JSON.stringify(value.map(({ key, width }) => ({ key, width }))))
}, { deep: true })
onBeforeUnmount(() => resizeCleanup?.())

function startColumnDrag(event: DragEvent, key: ColumnKey) {
  draggedColumn.value = key
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }
}
function dropColumn(targetKey: ColumnKey) {
  if (!draggedColumn.value || draggedColumn.value === targetKey) return
  const sourceIndex = columns.value.findIndex(column => column.key === draggedColumn.value)
  const targetIndex = columns.value.findIndex(column => column.key === targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return
  const next = [...columns.value]
  const [moved] = next.splice(sourceIndex, 1)
  if (!moved) return
  next.splice(targetIndex, 0, moved)
  columns.value = next
  draggedColumn.value = null
}
function startColumnResize(event: PointerEvent, column: TableColumn) {
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startWidth = column.width
  const move = (moveEvent: PointerEvent) => { column.width = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX) }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    document.body.classList.remove('resizing-columns')
    resizeCleanup = undefined
  }
  resizeCleanup?.()
  resizeCleanup = stop
  document.body.classList.add('resizing-columns')
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
}
function resetColumnLayout() {
  columns.value = defaultColumns.map(column => ({ ...column }))
}
function cycleNrSort() {
  nrSort.value = nrSort.value === null ? 'asc' : nrSort.value === 'asc' ? 'desc' : null
}
function cellClass(pcn: any, key: ColumnKey) {
  if (key === 'risk') return ['fill-cell', `fill-${pcn.risk.toLowerCase()}`]
  if (key === 'upload') return ['fill-cell', `fill-${pcn.upload_state.toLowerCase().replaceAll('_', '-')}`]
  if (key === 'csc') return ['fill-cell', `fill-${pcn.csc_status.toLowerCase().replaceAll('_', '-')}`]
  if (key === 'delta') return ['fill-cell', 'delta-status-cell', `fill-delta-${pcn.delta_status.toLowerCase()}`]
  if (key === 'alignment') return ['fill-cell', `fill-${pcn.risk_alignment.toLowerCase().replaceAll('_', '-')}`]
  if (key === 'nr') return ['numeric-cell']
  return []
}
function applyFilters() {
  clearTimeout(timer)
  timer = setTimeout(() => router.push({ query: activeFilters() }), 200)
}
function openRevenuePcn(item: { id: number }) {
  navigateTo({ path: `/pcns/${item.id}`, query: { revenueFrom: revenueFrom.value, revenueTo: revenueTo.value } })
}

const exportFill: Record<string, string> = {
  MAJOR: 'FFFF0000', MINOR: 'FFFFFF00', EOL: 'FF9900FF', UNKNOWN: 'FFC8C8C8',
  ALL_UPLOADED: 'FF00F04B', PARTLY_UPLOADED: 'FFFFFF00', NOT_UPLOADED: 'FFFF0000',
  COMPLETE: 'FF00F04B', PROCESSING: 'FFFFFF00', REJECT: 'FFFF0000', CANCEL: 'FF000000', MIXED: 'FFFF7900', BLANK: 'FFB8B8B8',
  MATCH: 'FF00F04B', MISMATCH: 'FFFF008C', NOT_ON_DELTA: 'FFB8B8B8', NOT_APPLICABLE: 'FFB8B8B8',
  CSC_UPLOADED: 'FFFFFF00', CONFIRMED: 'FF00F04B',
  FULL_RA: 'FF00F04B', PARTLY_MISS_RA: 'FFFFFF00', MISS_ALL_RA: 'FFFF0000', NA: 'FFB8B8B8',
}

function displayState(value: string) {
  return value.replaceAll('_', ' ')
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
    sheet.columns = columns.value.map(column => ({
      header: column.key === 'nr' ? `NR (${data.value.revenueFrom} to ${data.value.revenueTo})` : column.label,
      key: column.key,
      width: Math.max(14, Math.round(column.width / 7)),
    }))
    sheet.getRow(1).height = 24
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2940' } }
    })

    for (const pcn of sortedPcns.value) {
      const row = sheet.addRow({
        record: `${pcn.pcn_number_base}\n${pcn.title}\nParts (${pcn.part_count}): ${pcn.ti_affected_parts || '—'}\nRAs: ${pcn.ra_count}`,
        changeType: pcn.change_type || 'Unspecified',
        risk: displayState(pcn.risk),
        upload: `${displayState(pcn.upload_state)} (${pcn.uploaded_parts}/${pcn.delta_relevant_parts})`,
        csc: `${displayState(pcn.csc_status)}${pcn.csc_form_no ? ` · ${pcn.csc_form_no}` : ''}`,
        delta: `${displayState(pcn.delta_status)}${pcn.statuses && pcn.statuses !== pcn.delta_status ? ` · ${pcn.statuses}` : ''}`,
        nr: Number(pcn.net_revenue),
        alignment: `${displayState(pcn.risk_alignment)}${pcn.delta_risks ? ` · Delta: ${pcn.delta_risks}` : ''}`,
      })
      row.getCell(columns.value.findIndex(column => column.key === 'record') + 1).numFmt = '@'
      row.getCell(columns.value.findIndex(column => column.key === 'nr') + 1).numFmt = '#,##0.00'
      for (const [key, state] of [['risk', pcn.risk], ['upload', pcn.upload_state], ['csc', pcn.csc_status], ['delta', pcn.delta_status], ['alignment', pcn.risk_alignment]] as const) {
        const cell = row.getCell(columns.value.findIndex(column => column.key === key) + 1)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: exportFill[state] || 'FFFFFFFF' } }
        cell.font = { bold: true, color: { argb: ['MAJOR', 'REJECT', 'CANCEL', 'MISMATCH', 'MISS_ALL_RA'].includes(state) ? 'FFFFFFFF' : 'FF000000' } }
      }
    }

    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.value.length)}1` }
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.height = 54
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true }
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
      <div class="list-meta"><span v-if="data"><strong>{{ data.total.toLocaleString() }}</strong> records <template v-if="executiveState">· Executive queue: <strong>{{ executiveState.replaceAll('_', ' ') }}</strong> <NuxtLink to="/pcns" class="clear-filter">Clear</NuxtLink></template></span><div class="column-layout-tools"><span v-if="status === 'pending'" class="muted"><Icon name="lucide:loader-circle" class="spin" /> Updating</span><span><Icon name="lucide:move-horizontal" /> Drag headers · resize edges</span><button type="button" @click="resetColumnLayout"><Icon name="lucide:rotate-ccw" /> Reset columns</button></div></div>
      <div class="revenue-period">
        <strong>NR period</strong>
        <label>From <input v-model="revenueFrom" type="month" @change="applyFilters()" /></label>
        <label>To <input v-model="revenueTo" type="month" @change="applyFilters()" /></label>
        <span>{{ isRevenuePriorityQueue ? 'This executive queue is ranked by affected-part NR.' : 'NR is the sum of affected-part revenue in this period.' }}</span>
      </div>
      <div v-if="['MINOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA'].includes(executiveState)" class="queue-revenue-chart">
        <ExecutiveRevenuePie :title="revenueChartTitle" :items="revenueChartItems" @select="openRevenuePcn" />
      </div>
      <div class="table-wrap configurable-table-wrap"><table class="records-table configurable-records-table" :style="{ width: `${tableWidth}px` }">
        <colgroup><col v-for="column in columns" :key="column.key" :style="{ width: `${column.width}px` }" /></colgroup>
        <thead><tr>
          <th v-for="column in columns" :key="column.key" :draggable="true" :class="{ 'column-dragging': draggedColumn === column.key }" :aria-sort="column.key === 'nr' ? (nrSort === 'asc' ? 'ascending' : nrSort === 'desc' ? 'descending' : 'none') : undefined" @dragstart="startColumnDrag($event, column.key)" @dragend="draggedColumn = null" @dragover.prevent @drop.prevent="dropColumn(column.key)">
            <button v-if="column.key === 'nr'" type="button" class="column-heading column-sort-button" :title="nrSort === 'asc' ? 'Sort NR decreasing' : nrSort === 'desc' ? 'Do not sort by NR' : 'Sort NR increasing'" draggable="false" @dragstart.prevent @click.stop="cycleNrSort"><Icon name="lucide:grip-vertical" /> {{ column.label }} <Icon :name="nrSort === 'asc' ? 'lucide:arrow-up' : nrSort === 'desc' ? 'lucide:arrow-down' : 'lucide:arrow-up-down'" class="sort-icon" /></button>
            <span v-else class="column-heading"><Icon name="lucide:grip-vertical" /> {{ column.label }}</span>
            <input v-if="column.key === 'record'" v-model="search" class="column-filter" placeholder="Search PCN, part or RA…" @dragstart.prevent @input="applyFilters()" />
            <select v-else-if="column.key === 'changeType'" v-model="changeType" class="column-filter" @dragstart.prevent @change="applyFilters()"><option value="">(All)</option><option v-for="type in changeTypes" :key="type.id" :value="type.name">{{ type.name }}</option></select>
            <select v-else-if="column.key === 'risk'" v-model="risk" class="column-filter" @dragstart.prevent @change="applyFilters()"><option value="">(All)</option><option>MAJOR</option><option>MINOR</option><option>EOL</option><option>UNKNOWN</option></select>
            <select v-else-if="column.key === 'upload'" v-model="uploadState" class="column-filter" @dragstart.prevent @change="applyFilters()"><option value="">(All)</option><option value="ALL_UPLOADED">All uploaded</option><option value="PARTLY_UPLOADED">Partly uploaded</option><option value="NOT_UPLOADED">Not uploaded</option></select>
            <select v-else-if="column.key === 'csc'" v-model="cscStatus" class="column-filter" @dragstart.prevent @change="applyFilters()"><option value="">(All)</option><option value="NA">NA</option><option value="NOT_UPLOADED">Not uploaded</option><option value="CSC_UPLOADED">CSC uploaded</option><option value="CONFIRMED">Confirmed uploaded</option></select>
            <select v-else-if="column.key === 'delta'" v-model="statusFilter" class="column-filter" @dragstart.prevent @change="applyFilters()"><option value="">(All)</option><option>CANCEL</option><option>PROCESSING</option><option>REJECT</option><option>COMPLETE</option><option>MIXED</option><option value="BLANK">Blank</option></select>
            <select v-else-if="column.key === 'alignment'" v-model="riskAlignment" class="column-filter" @dragstart.prevent @change="applyFilters()"><option value="">(All)</option><option value="MISMATCH">Mismatch</option><option value="MATCH">Match</option><option value="NOT_ON_DELTA">Not on Delta</option><option value="NOT_APPLICABLE">Not applicable</option></select>
            <span v-else class="column-period">{{ revenueFrom }}–{{ revenueTo }}</span>
            <span class="column-resizer" title="Drag to resize" @pointerdown="startColumnResize($event, column)" />
          </th>
        </tr></thead>
        <tbody><tr v-for="pcn in sortedPcns" :key="pcn.id">
          <td v-for="column in columns" :key="column.key" :class="cellClass(pcn, column.key)">
            <NuxtLink v-if="column.key === 'record'" :to="{ path: `/pcns/${pcn.id}`, query: { revenueFrom, revenueTo } }" class="record-title"><span class="mono-link">{{ pcn.pcn_number_base }}</span><small>{{ pcn.title }}</small><small class="record-data-line" :title="pcn.ti_affected_parts || ''"><strong>Parts {{ pcn.part_count }}</strong> · {{ pcn.ti_affected_parts || '—' }}</small><small><strong>RA {{ pcn.ra_count }}</strong><template v-if="pcn.ra_state !== 'NA'"> · {{ displayState(pcn.ra_state) }} {{ pcn.ra_covered_parts }}/{{ pcn.total_parts }}</template></small></NuxtLink>
            <template v-else-if="column.key === 'changeType'">{{ pcn.change_type || 'Unspecified' }}</template>
            <RiskBadge v-else-if="column.key === 'risk'" :risk="pcn.risk" />
            <template v-else-if="column.key === 'upload'"><StateBadge :state="pcn.upload_state" /><small class="coverage-count">{{ pcn.uploaded_parts }}/{{ pcn.delta_relevant_parts }} Delta parts</small></template>
            <template v-else-if="column.key === 'csc'"><StateBadge :state="pcn.csc_status" /><small v-if="pcn.csc_form_no" class="coverage-count">{{ pcn.csc_form_no }}</small></template>
            <template v-else-if="column.key === 'delta'"><strong v-if="pcn.delta_status !== 'BLANK'">{{ pcn.delta_status }}</strong><small v-if="pcn.statuses && pcn.statuses !== pcn.delta_status" class="coverage-count">{{ pcn.statuses }}</small></template>
            <strong v-else-if="column.key === 'nr'">{{ Number(pcn.net_revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong>
            <template v-else-if="column.key === 'alignment'"><StateBadge :state="pcn.risk_alignment" kind="alignment" /><small v-if="pcn.delta_risks" class="coverage-count">Delta: {{ pcn.delta_risks }}</small></template>
          </td>
        </tr></tbody>
      </table></div>
      <EmptyState v-if="status !== 'pending' && !data?.items.length" title="No matching PCNs" text="Adjust the filters or create a new PCN record." icon="lucide:search-x" />
      <div v-else-if="status === 'pending'" class="table-loading"><div v-for="i in 8" :key="i" class="skeleton row" /></div>
    </section>
  </div>
</template>
