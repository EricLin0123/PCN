<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const search = ref(String(route.query.search || ''))
const risk = ref(String(route.query.risk || ''))
const statusFilter = ref(String(route.query.status || ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const query = computed(() => ({ search: String(route.query.search || ''), risk: String(route.query.risk || ''), status: String(route.query.status || ''), page: page.value }))
const { data, status } = await useFetch<any>('/api/pcns', { query, watch: [query] })
let timer: ReturnType<typeof setTimeout>
function applyFilters(resetPage = true) {
  clearTimeout(timer)
  timer = setTimeout(() => router.push({ query: { ...(search.value && { search: search.value }), ...(risk.value && { risk: risk.value }), ...(statusFilter.value && { status: statusFilter.value }), ...(!resetPage && page.value > 1 && { page: page.value }) } }), 200)
}
function goPage(value: number) { router.push({ query: { ...route.query, page: value > 1 ? value : undefined } }) }
</script>

<template>
  <div class="page">
    <header class="page-header"><div><p class="eyebrow">Database</p><h1>PCN records</h1><p>Search authoritative TI parts, notification details, and Delta workflow.</p></div><NuxtLink to="/pcns/new" class="button primary"><Icon name="lucide:plus" /> Add PCN</NuxtLink></header>
    <section class="panel filter-panel">
      <label class="search-box"><Icon name="lucide:search" /><input v-model="search" placeholder="Search PCN, title, or TI part…" @input="applyFilters()" /></label>
      <select v-model="risk" @change="applyFilters()"><option value="">All risk levels</option><option>MAJOR</option><option>MINOR</option><option>UNKNOWN</option></select>
      <select v-model="statusFilter" @change="applyFilters()"><option value="">All form statuses</option><option>REJECT</option><option>PROCESSING</option><option>COMPLETE</option></select>
    </section>
    <section class="panel list-panel">
      <div class="list-meta"><span v-if="data"><strong>{{ data.total.toLocaleString() }}</strong> records</span><span v-if="status === 'pending'" class="muted"><Icon name="lucide:loader-circle" class="spin" /> Updating</span></div>
      <div v-if="data?.items.length" class="table-wrap"><table class="records-table">
        <thead><tr><th>PCN</th><th>Notification</th><th>Change type</th><th>Risk</th><th>Coverage</th><th>Delta status</th><th /></tr></thead>
        <tbody><tr v-for="pcn in data.items" :key="pcn.id">
          <td><NuxtLink :to="`/pcns/${pcn.id}`" class="record-title"><span class="mono-link">{{ pcn.pcn_number_base }}</span><small>{{ pcn.title }}</small></NuxtLink></td>
          <td>{{ pcn.notification_date || '—' }}</td><td>{{ pcn.change_type || 'Unspecified' }}</td><td><RiskBadge :risk="pcn.risk" /></td>
          <td><span class="count"><Icon name="lucide:cpu" /> {{ pcn.part_count }}</span><span class="count"><Icon name="lucide:clipboard" /> {{ pcn.form_count }}</span></td>
          <td><span v-if="pcn.statuses" class="status-pill">{{ pcn.statuses }}</span><span v-else class="muted">No form</span></td>
          <td><NuxtLink :to="`/pcns/${pcn.id}`" class="icon-button"><Icon name="lucide:chevron-right" /></NuxtLink></td>
        </tr></tbody>
      </table></div>
      <EmptyState v-else-if="status !== 'pending'" title="No matching PCNs" text="Adjust the filters or create a new PCN record." icon="lucide:search-x" />
      <div v-else class="table-loading"><div v-for="i in 8" :key="i" class="skeleton row" /></div>
      <footer v-if="data && data.pages > 1" class="pagination"><button :disabled="page === 1" @click="goPage(page - 1)"><Icon name="lucide:chevron-left" /> Previous</button><span>Page <strong>{{ page }}</strong> of {{ data.pages }}</span><button :disabled="page === data.pages" @click="goPage(page + 1)">Next <Icon name="lucide:chevron-right" /></button></footer>
    </section>
  </div>
</template>
