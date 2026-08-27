<script setup lang="ts">
const { data, status, error, refresh } = await useFetch<any>('/api/executive-summary')
function openQueue(key: string) { navigateTo({ path: '/pcns', query: { executiveState: key } }) }
function ownerClass(owner: string) {
  if (owner === 'TI') return 'owner-ti'
  if (owner === 'Delta') return 'owner-delta'
  if (owner === 'Closed') return 'owner-closed'
  return 'owner-ti-delta'
}
</script>

<template>
  <div class="page executive-page">
    <header class="page-header"><div><p class="eyebrow">Management action board</p><h1>Executive summary</h1><p>Mutually exclusive PCN queues ordered by operational priority.</p></div></header>
    <div v-if="status === 'pending'" class="skeleton" />
    <div v-else-if="error" class="alert error">Executive summary could not be loaded. <button @click="refresh()">Try again</button></div>
    <template v-else>
      <section class="executive-total"><span>PCNs classified</span><strong>{{ data.total.toLocaleString() }}</strong><small v-if="data.other">{{ data.other }} unclassified</small></section>
      <section class="executive-sheet"><table><thead><tr><th>Owner</th><th>Status</th><th>Definition</th><th>PCNs</th><th>Action</th></tr></thead><tbody>
        <tr v-for="queue in data.queues" :key="queue.key" tabindex="0" class="executive-row" @click="openQueue(queue.key)" @keydown.enter="openQueue(queue.key)">
          <td class="owner-cell" :class="ownerClass(queue.owner)">{{ queue.owner }}</td><td class="executive-fill" :class="`executive-${queue.tone}`"><strong>{{ queue.status }}</strong></td><td>{{ queue.definition }}</td><td class="executive-count" :class="`executive-${queue.tone}`">{{ queue.value.toLocaleString() }}</td><td><strong>{{ queue.action }}</strong><Icon name="lucide:arrow-right" /></td>
        </tr>
      </tbody></table></section>
      <section class="exception-sheet"><div class="section-title"><div><p class="eyebrow">Cross-cutting exception</p><h2>Additional review queue</h2></div></div><table><thead><tr><th>Owner</th><th>Status</th><th>Definition</th><th>PCNs</th><th>Action</th></tr></thead><tbody><tr tabindex="0" class="executive-row" @click="navigateTo({ path: '/pcns', query: { riskAlignment: 'MISMATCH' } })" @keydown.enter="navigateTo({ path: '/pcns', query: { riskAlignment: 'MISMATCH' } })"><td class="owner-cell owner-ti-delta">TI / Delta</td><td class="executive-fill executive-magenta"><strong>Risk mismatch</strong></td><td>Expected TI risk differs from Delta NOTIFY</td><td class="executive-count executive-magenta">{{ data.riskMismatch.toLocaleString() }}</td><td><strong>Verify and correct Delta risk label</strong><Icon name="lucide:arrow-right" /></td></tr></tbody></table></section>
    </template>
  </div>
</template>
