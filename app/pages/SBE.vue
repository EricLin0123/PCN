<script setup lang="ts">
const search = ref('')
const { data, status, error, refresh } = await useFetch<any>('/api/organization')
const { isAdmin } = useAuth()
const savingChampionId = ref<number | null>(null)
const message = ref('')
const messageType = ref('success')
const pendingDetail = ref<any>(null)
const pendingDetailLoading = ref(false)
const pendingDetailError = ref('')
const pendingMetricKeys = [
  'pendingRaPartCount',
  'pendingRaPcnCount',
  'pendingPpapPartCount',
  'pendingPpapPcnCount'
] as const

type PendingMetricKey = typeof pendingMetricKeys[number]

function notify(text: string, type = 'success') {
  message.value = text
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3500)
}

async function saveChampion(group: any) {
  savingChampionId.value = group.id
  try {
    await $fetch(`/api/sbe1/${group.id}/champion`, { method: 'PATCH', body: { champion_email: group.championEmail } })
    await refresh()
    notify(`Champion email updated for ${group.name}.`)
  } catch (saveError: any) {
    notify(saveError.data?.statusMessage || 'Unable to update champion email.', 'error')
  } finally {
    savingChampionId.value = null
  }
}

const filteredOrganizations = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value?.organizations || []

  return (data.value?.organizations || []).flatMap((sbe: any) => {
    if (sbe.name.toLowerCase().includes(term)) return [sbe]

    const sbe1 = sbe.sbe1.flatMap((group: any) => {
      if (group.name.toLowerCase().includes(term) || group.championEmail?.toLowerCase().includes(term)) return [group]
      const sbe2 = group.sbe2.filter((team: any) => team.name.toLowerCase().includes(term))
      return sbe2.length ? [{ ...group, sbe2 }] : []
    })
    return sbe1.length ? [{ ...sbe, sbe1 }] : []
  })
})

const pendingMetricRanges = computed(() => Object.fromEntries(pendingMetricKeys.map((key) => {
  const values = (data.value?.organizations || []).flatMap((sbe: any) =>
    sbe.sbe1.map((group: any) => Number(group[key]) || 0)
  )
  return [key, { min: Math.min(...values), max: Math.max(...values) }]
})))

function pendingHeatmapStyle(key: PendingMetricKey, value: number) {
  const range = pendingMetricRanges.value[key]
  const ratio = range && range.max > range.min
    ? (value - range.min) / (range.max - range.min)
    : 0

  return { backgroundColor: `hsl(${120 * (1 - ratio)} 72% 84%)` }
}

async function showPendingDetail(group: any, documentType: 'RA' | 'PPAP', groupBy: 'part' | 'pcn') {
  pendingDetail.value = {
    sbe1: { id: group.id, name: group.name },
    documentType,
    groupBy,
    items: []
  }
  pendingDetailLoading.value = true
  pendingDetailError.value = ''
  try {
    pendingDetail.value = await $fetch(`/api/sbe1/${group.id}/pending`, {
      query: { documentType, groupBy }
    })
  } catch (detailError: any) {
    pendingDetailError.value = detailError.data?.statusMessage || 'Unable to load pending records.'
  } finally {
    pendingDetailLoading.value = false
  }
}

function closePendingDetail() {
  pendingDetail.value = null
  pendingDetailError.value = ''
}

function pendingDetailTitle() {
  if (!pendingDetail.value) return ''
  const unit = pendingDetail.value.groupBy === 'part' ? 'parts' : 'PCNs'
  return `Pending ${pendingDetail.value.documentType} ${unit}`
}

function closePendingDetailOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && pendingDetail.value) closePendingDetail()
}

onMounted(() => window.addEventListener('keydown', closePendingDetailOnEscape))
onBeforeUnmount(() => window.removeEventListener('keydown', closePendingDetailOnEscape))
</script>

<template>
  <div class="page organization-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Ownership</p>
        <h1>SBE</h1>
        <p>SBE hierarchy, SBE-1 champions, and SBE-2 teams.</p>
      </div>
    </header>
    <Transition name="toast"><div v-if="message" class="toast" :class="messageType"><Icon :name="messageType === 'success' ? 'lucide:circle-check' : 'lucide:circle-alert'" />{{ message }}</div></Transition>

    <section v-if="data" class="organization-metrics">
      <div><span>SBE</span><strong>{{ data.totals.sbe_count.toLocaleString() }}</strong></div>
      <div><span>SBE-1</span><strong>{{ data.totals.sbe1_count.toLocaleString() }}</strong></div>
      <div><span>SBE-2</span><strong>{{ data.totals.sbe2_count.toLocaleString() }}</strong></div>
      <div><span>Mapped parts</span><strong>{{ data.totals.part_count.toLocaleString() }}</strong></div>
    </section>

    <section class="organization-toolbar panel">
      <div class="organization-search">
        <Icon name="lucide:search" />
        <input v-model="search" type="search" placeholder="Search SBE, SBE-1, champion, or SBE-2…">
      </div>
      <span v-if="data">{{ filteredOrganizations.length }} SBE group{{ filteredOrganizations.length === 1 ? '' : 's'
      }}</span>
    </section>

    <div v-if="error" class="alert error">SBE hierarchy could not be loaded. <button @click="refresh()">Try
        again</button></div>
    <div v-else-if="status === 'pending' && !data" class="organization-grid">
      <div v-for="i in 3" :key="i" class="skeleton organization-skeleton" />
    </div>
    <section v-else-if="filteredOrganizations.length" class="organization-grid">
      <article v-for="sbe in filteredOrganizations" :key="sbe.id ?? 'unmapped'" class="organization-tree panel"
        :class="{ 'organization-unmapped': sbe.id === null }">
        <header class="sbe-node">
          <span>SBE</span>
          <strong>{{ sbe.name }}</strong>
          <small>{{ sbe.partCount.toLocaleString() }} mapped part{{ sbe.partCount === 1 ? '' : 's' }}</small>
        </header>

        <div class="sbe1-branches">
          <article v-for="group in sbe.sbe1" :key="group.id" class="sbe1-branch">
            <div class="sbe1-content">
              <header class="sbe1-node">
              <div><span>SBE-1</span><strong>{{ group.name }}</strong>
                <form v-if="isAdmin" class="champion-email-editor" @submit.prevent="saveChampion(group)">
                  <input v-model="group.championEmail" type="email" aria-label="Champion email" placeholder="Champion not assigned" />
                  <button class="icon-button save" title="Save champion email" :disabled="savingChampionId === group.id"><Icon :name="savingChampionId === group.id ? 'lucide:loader-circle' : 'lucide:save'" :class="{ spin: savingChampionId === group.id }" /></button>
                </form>
                <strong v-else-if="group.championEmail" class="champion-email"><Icon name="lucide:mail" /> {{ group.championEmail }}</strong>
                <span v-if="!group.championEmail" class="champion-missing"><Icon name="lucide:user-round-x" /> Champion not assigned</span>
                <small class="sbe1-total">{{ group.partCount.toLocaleString() }} part{{ group.partCount === 1 ? '' : 's' }}</small>
              </div>
              </header>

              <div v-if="group.sbe2.length" class="sbe2-list">
              <div v-for="team in group.sbe2" :key="team.id" class="sbe2-node">
                <span>SBE-2</span><strong>{{ team.name }}</strong><small>{{ team.partCount.toLocaleString() }} part{{
                  team.partCount === 1 ? '' : 's' }}</small>
              </div>
              </div>
              <div v-else class="sbe2-empty">No SBE-2 mapping</div>
            </div>
            <div class="sbe1-summary">
              <button type="button" :style="pendingHeatmapStyle('pendingRaPartCount', group.pendingRaPartCount)" :aria-label="`Show ${group.pendingRaPartCount} pending RA parts for ${group.name}`" @click="showPendingDetail(group, 'RA', 'part')"><small>Pending RA parts</small><strong>{{ group.pendingRaPartCount.toLocaleString() }}</strong></button>
              <button type="button" :style="pendingHeatmapStyle('pendingRaPcnCount', group.pendingRaPcnCount)" :aria-label="`Show ${group.pendingRaPcnCount} pending RA PCNs for ${group.name}`" @click="showPendingDetail(group, 'RA', 'pcn')"><small>Pending RA PCNs</small><strong>{{ group.pendingRaPcnCount.toLocaleString() }}</strong></button>
              <button type="button" :style="pendingHeatmapStyle('pendingPpapPartCount', group.pendingPpapPartCount)" :aria-label="`Show ${group.pendingPpapPartCount} pending PPAP parts for ${group.name}`" @click="showPendingDetail(group, 'PPAP', 'part')"><small>Pending PPAP parts</small><strong>{{ group.pendingPpapPartCount.toLocaleString() }}</strong></button>
              <button type="button" :style="pendingHeatmapStyle('pendingPpapPcnCount', group.pendingPpapPcnCount)" :aria-label="`Show ${group.pendingPpapPcnCount} pending PPAP PCNs for ${group.name}`" @click="showPendingDetail(group, 'PPAP', 'pcn')"><small>Pending PPAP PCNs</small><strong>{{ group.pendingPpapPcnCount.toLocaleString() }}</strong></button>
            </div>
          </article>
        </div>
      </article>
    </section>
    <EmptyState v-else-if="data" title="No matching SBE" text="Try another SBE, champion, or team name."
      icon="lucide:search-x" />

    <div v-if="pendingDetail" class="pending-detail-backdrop" @click.self="closePendingDetail">
      <section class="pending-detail" role="dialog" aria-modal="true" aria-labelledby="pending-detail-title">
        <header>
          <div><p class="eyebrow">{{ pendingDetail.sbe1.name }}</p><h2 id="pending-detail-title">{{ pendingDetailTitle() }}</h2></div>
          <button class="icon-button" type="button" title="Close details" aria-label="Close details" @click="closePendingDetail"><Icon name="lucide:x" /></button>
        </header>
        <div class="pending-detail-meta">
          <span v-if="pendingDetailLoading"><Icon name="lucide:loader-circle" class="spin" /> Loading records…</span>
          <span v-else-if="!pendingDetailError"><strong>{{ pendingDetail.items.length.toLocaleString() }}</strong> matching {{ pendingDetail.groupBy === 'part' ? 'parts' : 'PCNs' }}</span>
        </div>
        <div v-if="pendingDetailError" class="alert error">{{ pendingDetailError }}</div>
        <div v-else-if="pendingDetailLoading" class="pending-detail-loading"><div v-for="i in 6" :key="i" class="skeleton row" /></div>
        <div v-else-if="pendingDetail.items.length" class="table-wrap pending-detail-table">
          <table v-if="pendingDetail.groupBy === 'part'">
            <thead><tr><th>Part</th><th>Industry</th><th>Pending {{ pendingDetail.documentType }} PCNs</th></tr></thead>
            <tbody><tr v-for="item in pendingDetail.items" :key="item.id"><td class="mono"><NuxtLink :to="{ path: '/parts', query: { search: item.partNumber } }" class="mono-link">{{ item.partNumber }}</NuxtLink></td><td>{{ item.industry || '—' }}</td><td><div class="pending-related-list"><NuxtLink v-for="pcn in item.pcns" :key="pcn.id" :to="`/pcns/${pcn.id}`" class="mono-link" :title="pcn.title">{{ pcn.number }}</NuxtLink></div></td></tr></tbody>
          </table>
          <table v-else>
            <thead><tr><th>PCN</th><th>Notification date</th><th>Title</th><th>Pending {{ pendingDetail.documentType }} parts</th></tr></thead>
            <tbody><tr v-for="item in pendingDetail.items" :key="item.id"><td class="mono"><NuxtLink :to="`/pcns/${item.id}`" class="mono-link">{{ item.number }}</NuxtLink></td><td>{{ item.notificationDate || '—' }}</td><td>{{ item.title || '—' }}</td><td><div class="pending-related-list"><NuxtLink v-for="part in item.parts" :key="part.id" :to="{ path: '/parts', query: { search: part.partNumber } }" class="mono-link">{{ part.partNumber }}</NuxtLink></div></td></tr></tbody>
          </table>
        </div>
        <EmptyState v-else title="No pending records" :text="`No pending ${pendingDetail.documentType} ${pendingDetail.groupBy === 'part' ? 'parts' : 'PCNs'} belong to ${pendingDetail.sbe1.name}.`" icon="lucide:circle-check" />
      </section>
    </div>
  </div>
</template>
