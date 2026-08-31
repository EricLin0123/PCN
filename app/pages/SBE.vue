<script setup lang="ts">
const search = ref('')
const { data, status, error, refresh } = await useFetch<any>('/api/organization')
const { isAdmin } = useAuth()
const savingChampionId = ref<number | null>(null)
const message = ref('')
const messageType = ref('success')

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
            <header class="sbe1-node">
              <div><span>SBE-1</span><strong>{{ group.name }}</strong>
                <form v-if="isAdmin" class="champion-email-editor" @submit.prevent="saveChampion(group)">
                  <input v-model="group.championEmail" type="email" aria-label="Champion email" placeholder="Champion not assigned" />
                  <button class="icon-button save" title="Save champion email" :disabled="savingChampionId === group.id"><Icon :name="savingChampionId === group.id ? 'lucide:loader-circle' : 'lucide:save'" :class="{ spin: savingChampionId === group.id }" /></button>
                </form>
                <strong v-else-if="group.championEmail" class="champion-email"><Icon name="lucide:mail" /> {{ group.championEmail }}</strong>
                <span v-if="!group.championEmail" class="champion-missing"><Icon name="lucide:user-round-x" /> Champion not assigned</span>
              </div>
              <small>{{ group.partCount.toLocaleString() }} part{{ group.partCount === 1 ? '' : 's' }}</small>
            </header>

            <div v-if="group.sbe2.length" class="sbe2-list">
              <div v-for="team in group.sbe2" :key="team.id" class="sbe2-node">
                <span>SBE-2</span><strong>{{ team.name }}</strong><small>{{ team.partCount.toLocaleString() }} part{{
                  team.partCount === 1 ? '' : 's' }}</small>
              </div>
            </div>
            <div v-else class="sbe2-empty">No SBE-2 mapping</div>
          </article>
        </div>
      </article>
    </section>
    <EmptyState v-else-if="data" title="No matching SBE" text="Try another SBE, champion, or team name."
      icon="lucide:search-x" />
  </div>
</template>
