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
const query = computed(() => ({ search: String(route.query.search || ''), risk: String(route.query.risk || ''), status: String(route.query.status || ''), uploadState: String(route.query.uploadState || ''), riskAlignment: String(route.query.riskAlignment || ''), raState: String(route.query.raState || ''), changeType: String(route.query.changeType || ''), executiveState: String(route.query.executiveState || ''), pageSize: 'all' }))
const { data, status } = await useFetch<any>('/api/pcns', { query, watch: [query] })
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
let timer: ReturnType<typeof setTimeout>
function applyFilters() {
  clearTimeout(timer)
  timer = setTimeout(() => router.push({ query: { ...(search.value && { search: search.value }), ...(changeType.value && { changeType: changeType.value }), ...(risk.value && { risk: risk.value }), ...(statusFilter.value && { status: statusFilter.value }), ...(uploadState.value && { uploadState: uploadState.value }), ...(riskAlignment.value && { riskAlignment: riskAlignment.value }), ...(raState.value && { raState: raState.value }), ...(executiveState.value && { executiveState: executiveState.value }) } }), 200)
}
</script>

<template>
  <div class="page">
    <header class="page-header"><div><p class="eyebrow">Database</p><h1>PCN records</h1><p>Search authoritative TI parts, notification details, and Delta workflow.</p></div><NuxtLink to="/pcns/new" class="button primary"><Icon name="lucide:plus" /> Add PCN</NuxtLink></header>
    <section class="panel list-panel">
      <div class="list-meta"><span v-if="data"><strong>{{ data.total.toLocaleString() }}</strong> records <template v-if="executiveState">· Executive queue: <strong>{{ executiveState.replaceAll('_', ' ') }}</strong> <NuxtLink to="/pcns" class="clear-filter">Clear</NuxtLink></template></span><span v-if="status === 'pending'" class="muted"><Icon name="lucide:loader-circle" class="spin" /> Updating</span></div>
      <div v-if="data?.items.length" class="table-wrap"><table class="records-table">
        <thead><tr>
          <th><span class="column-heading">PCN / title / TI part</span><input v-model="search" class="column-filter" placeholder="Search…" @input="applyFilters()" /></th>
          <th><span class="column-heading">Change type</span><select v-model="changeType" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option v-for="type in changeTypes" :key="type.id" :value="type.name">{{ type.name }}</option></select></th>
          <th><span class="column-heading">Expected risk</span><select v-model="risk" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option>MAJOR</option><option>MINOR</option><option>EOL</option><option>UNKNOWN</option></select></th>
          <th><span class="column-heading">Upload state</span><select v-model="uploadState" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="ALL_UPLOADED">All uploaded</option><option value="PARTLY_UPLOADED">Partly uploaded</option><option value="NOT_UPLOADED">Not uploaded</option></select></th>
          <th><span class="column-heading">Delta status</span><select v-model="statusFilter" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option>CANCEL</option><option>PROCESSING</option><option>REJECT</option><option>COMPLETE</option><option value="BLANK">Blank</option></select></th>
          <th><span class="column-heading">Risk alignment</span><select v-model="riskAlignment" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="MISMATCH">Mismatch</option><option value="MATCH">Match</option><option value="NOT_ON_DELTA">Not on Delta</option><option value="NOT_APPLICABLE">Not applicable</option></select></th>
          <th><span class="column-heading">RA coverage</span><select v-model="raState" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="FULL_RA">Full RA</option><option value="PARTLY_MISS_RA">Partly Miss RA</option><option value="MISS_ALL_RA">Miss all RA</option><option value="NA">NA</option></select></th>
        </tr></thead>
        <tbody><tr v-for="pcn in data.items" :key="pcn.id">
          <td><NuxtLink :to="`/pcns/${pcn.id}`" class="record-title"><span class="mono-link">{{ pcn.pcn_number_base }}</span><small>{{ pcn.title }}</small></NuxtLink></td>
          <td>{{ pcn.change_type || 'Unspecified' }}</td><td class="fill-cell" :class="`fill-${pcn.risk.toLowerCase()}`"><RiskBadge :risk="pcn.risk" /></td>
          <td class="fill-cell" :class="`fill-${pcn.upload_state.toLowerCase().replaceAll('_', '-')}`"><StateBadge :state="pcn.upload_state" /><small class="coverage-count">{{ pcn.uploaded_parts }}/{{ pcn.total_parts }} parts</small></td>
          <td class="fill-cell delta-status-cell" :class="`fill-delta-${pcn.delta_status.toLowerCase()}`"><strong v-if="pcn.delta_status !== 'BLANK'">{{ pcn.delta_status }}</strong><small v-if="pcn.statuses && pcn.statuses !== pcn.delta_status" class="coverage-count">{{ pcn.statuses }}</small></td>
          <td class="fill-cell" :class="`fill-${pcn.risk_alignment.toLowerCase().replaceAll('_', '-')}`"><StateBadge :state="pcn.risk_alignment" kind="alignment" /><small v-if="pcn.delta_risks" class="coverage-count">Delta: {{ pcn.delta_risks }}</small></td>
          <td class="fill-cell" :class="`fill-ra-${pcn.ra_state.toLowerCase().replaceAll('_', '-')}`"><template v-if="pcn.ra_state !== 'NA'"><StateBadge :state="pcn.ra_state" /><small class="coverage-count">{{ pcn.ra_covered_parts }}/{{ pcn.total_parts }} parts</small></template></td>
        </tr></tbody>
      </table></div>
      <EmptyState v-else-if="status !== 'pending'" title="No matching PCNs" text="Adjust the filters or create a new PCN record." icon="lucide:search-x" />
      <div v-else class="table-loading"><div v-for="i in 8" :key="i" class="skeleton row" /></div>
    </section>
  </div>
</template>
