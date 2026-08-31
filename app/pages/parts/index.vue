<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const search = ref(String(route.query.search || ''))
const sbe1 = ref(String(route.query.sbe1 || ''))
const source = ref(String(route.query.source || ''))
const query = computed(() => ({
  search: String(route.query.search || ''),
  sbe1: String(route.query.sbe1 || ''),
  source: String(route.query.source || ''),
  page: String(route.query.page || '1'),
  pageSize: '50'
}))
const { data, status } = await useFetch<any>('/api/parts', { query, watch: [query] })
let timer: ReturnType<typeof setTimeout>

watch(() => route.query, (value) => {
  search.value = String(value.search || '')
  sbe1.value = String(value.sbe1 || '')
  source.value = String(value.source || '')
})

function activeFilters(page = 1) {
  return {
    ...(search.value && { search: search.value }),
    ...(sbe1.value && { sbe1: sbe1.value }),
    ...(source.value && { source: source.value }),
    ...(page > 1 && { page: String(page) })
  }
}

function applyFilters() {
  clearTimeout(timer)
  timer = setTimeout(() => router.push({ query: activeFilters() }), 200)
}

function changePage(page: number) {
  router.push({ query: activeFilters(page) })
}
</script>

<template>
  <div class="page parts-page">
    <header class="page-header">
      <div><p class="eyebrow">Database</p><h1>Parts</h1><p>Search TI parts, ownership, risk assessments, PCNs, and Delta mappings.</p></div>
    </header>

    <section v-if="data" class="parts-metrics">
      <div><span>All parts</span><strong>{{ data.totals.parts.toLocaleString() }}</strong></div>
      <div><span>Assigned</span><strong>{{ data.totals.assigned.toLocaleString() }}</strong></div>
      <div><span>Inferred</span><strong>{{ data.totals.inferred.toLocaleString() }}</strong></div>
      <div><span>Unassigned</span><strong>{{ data.totals.unassigned.toLocaleString() }}</strong></div>
    </section>

    <section class="panel list-panel parts-list-panel">
      <div class="list-meta"><span v-if="data"><strong>{{ data.total.toLocaleString() }}</strong> matching parts</span><span v-if="status === 'pending'" class="muted"><Icon name="lucide:loader-circle" class="spin" /> Updating</span></div>
      <div v-if="data?.items.length" class="table-wrap"><table class="parts-table">
        <thead><tr>
          <th><span class="column-heading">TI part / related record</span><input v-model="search" class="column-filter" placeholder="Search part, PCN, RA, Delta…" @input="applyFilters()" /></th>
          <th><span class="column-heading">Organization</span><select v-model="sbe1" class="column-filter" @change="applyFilters()"><option value="">All SBE-1</option><option v-for="option in data.sbe1Options" :key="option.name" :value="option.name">{{ option.name }} ({{ option.part_count }})</option></select></th>
          <th><span class="column-heading">Assignment</span><select v-model="source" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="AUTHORITATIVE">Authoritative</option><option value="INFERRED">Inferred</option><option value="UNASSIGNED">Unassigned</option></select></th>
          <th>Champion</th><th>Related PCNs</th><th>Risk assessments</th><th>Delta materials</th>
        </tr></thead>
        <tbody><tr v-for="part in data.items" :key="part.id">
          <td><strong class="mono part-number">{{ part.display_part_number }}</strong><small v-if="part.display_part_number !== part.normalized_part_number" class="part-secondary">{{ part.normalized_part_number }}</small></td>
          <td><span class="organization-path"><small>SBE</small><strong>{{ part.sbe_name || '—' }}</strong><small>SBE-1</small><strong>{{ part.sbe1_name || '—' }}</strong><small>SBE-2</small><strong>{{ part.sbe2_name || '—' }}</strong></span></td>
          <td><span class="ownership-label" :class="`ownership-${part.ownership_source.toLowerCase()}`">{{ part.ownership_source }}</span><small v-if="part.ownership_source === 'INFERRED'" class="part-secondary">Prefix {{ part.matched_prefix }} · {{ part.evidence_count }} reference{{ part.evidence_count === 1 ? '' : 's' }}</small></td>
          <td><a v-if="part.champion_email" class="email-link" :href="`mailto:${part.champion_email}`">{{ part.champion_email }}</a><span v-else>—</span></td>
          <td><div v-if="part.pcns.length" class="related-links"><NuxtLink v-for="pcn in part.pcns" :key="pcn.id" :to="`/pcns/${pcn.id}`" class="mono-link">{{ pcn.pcn_number_base }}</NuxtLink></div><span v-else>—</span></td>
          <td><strong v-if="part.ra_count">{{ part.ra_count }}</strong><small v-if="part.ra_numbers" class="part-secondary">RA {{ part.ra_numbers }}</small><span v-if="!part.ra_count">—</span></td>
          <td><span v-if="part.delta_part_numbers" class="mono">{{ part.delta_part_numbers }}</span><span v-else>—</span></td>
        </tr></tbody>
      </table></div>
      <EmptyState v-else-if="status !== 'pending'" title="No matching parts" text="Adjust the search or ownership filters." icon="lucide:search-x" />
      <div v-else class="table-loading"><div v-for="i in 10" :key="i" class="skeleton row" /></div>
      <div v-if="data && data.pages > 1" class="pagination"><button :disabled="data.page <= 1" @click="changePage(data.page - 1)"><Icon name="lucide:chevron-left" /> Previous</button><span>Page {{ data.page }} of {{ data.pages }}</span><button :disabled="data.page >= data.pages" @click="changePage(data.page + 1)">Next <Icon name="lucide:chevron-right" /></button></div>
    </section>
  </div>
</template>
