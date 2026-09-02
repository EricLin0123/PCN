<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const search = ref(String(route.query.search || ''))
const sbe1 = ref(String(route.query.sbe1 || ''))
const source = ref(String(route.query.source || ''))
const nrSort = ref(String(route.query.nrSort || ''))
const data = ref<any>(null)
const loading = ref(false)
const page = ref(1)
const pageSize = 100
const status = computed(() => loading.value ? 'pending' : 'success')
const hasMore = computed(() => Boolean(data.value && data.value.items.length < data.value.total))
let timer: ReturnType<typeof setTimeout>
let requestController: AbortController | undefined

async function loadParts(reset = false) {
  if (loading.value && !reset) return
  if (reset) {
    requestController?.abort()
    page.value = 1
  }

  const controller = new AbortController()
  requestController = controller
  loading.value = true
  try {
    const response = await $fetch<any>('/api/parts', {
      query: {
        search: String(route.query.search || ''),
        sbe1: String(route.query.sbe1 || ''),
        source: String(route.query.source || ''),
        nrSort: String(route.query.nrSort || ''),
        page: page.value,
        pageSize
      },
      signal: controller.signal
    })
    if (requestController !== controller) return
    const items = reset ? response.items : [...(data.value?.items || []), ...response.items]
    data.value = { ...response, items }
  } catch (error: any) {
    if (error?.name !== 'AbortError') throw error
  } finally {
    if (requestController === controller) loading.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || loading.value) return
  page.value += 1
  await loadParts()
}

function onTableScroll(event: Event) {
  const element = event.currentTarget as HTMLElement
  if (element.scrollHeight - element.scrollTop - element.clientHeight < 400) loadMore()
}

await loadParts(true)

watch(() => route.query, (value) => {
  search.value = String(value.search || '')
  sbe1.value = String(value.sbe1 || '')
  source.value = String(value.source || '')
  nrSort.value = String(value.nrSort || '')
  loadParts(true)
})

function activeFilters() {
  return {
    ...(search.value && { search: search.value }),
    ...(sbe1.value && { sbe1: sbe1.value }),
    ...(source.value && { source: source.value }),
    ...(nrSort.value && { nrSort: nrSort.value })
  }
}

function applyFilters() {
  clearTimeout(timer)
  timer = setTimeout(() => router.push({ query: activeFilters() }), 200)
}

function cycleNrSort() {
  nrSort.value = nrSort.value === 'desc' ? 'asc' : 'desc'
  router.push({ query: activeFilters() })
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
      <div class="list-meta"><span v-if="data"><strong>{{ data.items.length.toLocaleString() }}</strong> of {{ data.total.toLocaleString() }} matching parts loaded</span><span v-if="status === 'pending'" class="nr-calculating"><Icon name="lucide:loader-circle" class="spin" /> {{ data?.items.length ? 'Loading more parts…' : 'Calculating NR…' }}</span></div>
      <div v-if="data?.items.length" class="table-wrap" @scroll.passive="onTableScroll"><table class="parts-table">
        <thead><tr>
          <th><span class="column-heading">TI part / industry</span><input v-model="search" class="column-filter" placeholder="Search part, PCN, RA, Delta…" @input="applyFilters()" /></th>
          <th><button type="button" class="column-heading nr-sort-button" :title="nrSort === 'desc' ? 'Sort NR increasing' : 'Sort NR decreasing'" @click="cycleNrSort">NR <Icon :name="nrSort === 'asc' ? 'lucide:arrow-up' : nrSort === 'desc' ? 'lucide:arrow-down' : 'lucide:arrow-up-down'" /></button></th>
          <th><span class="column-heading">Organization</span><select v-model="sbe1" class="column-filter" @change="applyFilters()"><option value="">All SBE-1</option><option v-for="option in data.sbe1Options" :key="option.name" :value="option.name">{{ option.name }} ({{ option.part_count }})</option></select></th>
          <th><span class="column-heading">Assignment</span><select v-model="source" class="column-filter" @change="applyFilters()"><option value="">(All)</option><option value="AUTHORITATIVE">Authoritative</option><option value="INFERRED">Inferred</option><option value="UNASSIGNED">Unassigned</option></select></th>
          <th>Champion</th><th>Related PCNs</th><th>Risk assessments</th><th>Delta materials</th>
        </tr></thead>
        <tbody><tr v-for="part in data.items" :key="part.id">
          <td><strong class="mono part-number">{{ part.display_part_number }}</strong><small v-if="part.display_part_number !== part.normalized_part_number" class="part-secondary">{{ part.normalized_part_number }}</small><small class="part-secondary">Industry: {{ part.industry || '—' }}</small></td>
          <td class="nr-cell"><strong>{{ Number(part.net_revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></td>
          <td><span class="organization-path"><small>SBE</small><strong>{{ part.sbe_name || '—' }}</strong><small>SBE-1</small><strong>{{ part.sbe1_name || '—' }}</strong><small>SBE-2</small><strong>{{ part.sbe2_name || '—' }}</strong></span></td>
          <td><span class="ownership-label" :class="`ownership-${part.ownership_source.toLowerCase()}`">{{ part.ownership_source }}</span><small v-if="part.ownership_source === 'INFERRED'" class="part-secondary">Prefix {{ part.matched_prefix }} · {{ part.evidence_count }} reference{{ part.evidence_count === 1 ? '' : 's' }}</small></td>
          <td><a v-if="part.champion_email" class="email-link" :href="`mailto:${part.champion_email}`">{{ part.champion_email }}</a><span v-else>—</span></td>
          <td><div v-if="part.pcns.length" class="related-links"><NuxtLink v-for="pcn in part.pcns" :key="pcn.id" :to="`/pcns/${pcn.id}`" class="mono-link">{{ pcn.pcn_number_base }}</NuxtLink></div><span v-else>—</span></td>
          <td><strong v-if="part.ra_count">{{ part.ra_count }}</strong><small v-if="part.ra_numbers" class="part-secondary">RA {{ part.ra_numbers }}</small><span v-if="!part.ra_count">—</span></td>
          <td><span v-if="part.delta_part_numbers" class="mono">{{ part.delta_part_numbers }}</span><span v-else>—</span></td>
        </tr></tbody>
      </table><div v-if="hasMore" class="parts-load-more"><Icon v-if="loading" name="lucide:loader-circle" class="spin" />{{ loading ? 'Loading more parts…' : 'Scroll to load more' }}</div></div>
      <EmptyState v-else-if="status !== 'pending'" title="No matching parts" text="Adjust the search or ownership filters." icon="lucide:search-x" />
      <div v-else class="table-loading"><div class="nr-calculating-message"><Icon name="lucide:loader-circle" class="spin" /> Calculating NR…</div><div v-for="i in 10" :key="i" class="skeleton row" /></div>
    </section>
  </div>
</template>
