<script setup lang="ts">
const { data, status, error, refresh } = await useFetch<any>('/api/dashboard')
const maxStatus = computed(() => Math.max(...(data.value?.statuses || []).map((x: any) => x.value), 1))
const metricCards = computed(() => [
  { label: 'PCN records', value: data.value?.totals.pcns || 0, icon: 'lucide:files', tone: 'indigo' },
  { label: 'TI affected parts', value: data.value?.totals.tiParts || 0, icon: 'lucide:cpu', tone: 'cyan' },
  { label: 'Delta forms', value: data.value?.totals.deltaForms || 0, icon: 'lucide:clipboard-check', tone: 'amber' },
  { label: 'Risk assessments', value: data.value?.totals.riskAssessments || 0, icon: 'lucide:shield-check', tone: 'green' },
  { label: 'Unmatched forms', value: data.value?.totals.unmatchedForms || 0, icon: 'lucide:unlink', tone: 'rose' },
])
const stateCards = computed(() => [
  { label: 'All uploaded', value: data.value?.totals.allUploaded || 0, state: 'ALL_UPLOADED', icon: 'lucide:circle-check-big', text: 'Every Delta-relevant part is present' },
  { label: 'Partly uploaded', value: data.value?.totals.partlyUploaded || 0, state: 'PARTLY_UPLOADED', icon: 'lucide:circle-dot-dashed', text: 'Only some Delta-relevant parts are present' },
  { label: 'Not uploaded', value: data.value?.totals.notUploaded || 0, state: 'NOT_UPLOADED', icon: 'lucide:circle-x', text: 'No Delta-relevant parts found' },
  { label: 'Risk mismatch', value: data.value?.totals.riskMismatches || 0, alignment: 'MISMATCH', icon: 'lucide:badge-alert', text: 'Delta label differs from expected risk' },
])
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div><p class="eyebrow">Operations center</p><h1>PCN overview</h1><p>Live operational picture calculated from normalized database records.</p></div>
      <NuxtLink to="/pcns/new" class="button primary"><Icon name="lucide:plus" /> Add PCN</NuxtLink>
    </header>
    <div v-if="status === 'pending'" class="loading-grid"><div v-for="i in 4" :key="i" class="skeleton" /></div>
    <div v-else-if="error" class="alert error">Dashboard could not be loaded. <button @click="refresh()">Try again</button></div>
    <template v-else>
      <section class="metric-grid">
        <article v-for="card in metricCards" :key="card.label" class="metric-card">
          <span class="metric-icon" :class="card.tone"><Icon :name="card.icon" /></span>
          <div><p>{{ card.label }}</p><strong>{{ card.value.toLocaleString() }}</strong></div>
        </article>
      </section>

      <section class="state-card-grid">
        <NuxtLink v-for="card in stateCards" :key="card.label" :to="{ path: '/pcns', query: card.state ? { uploadState: card.state } : { riskAlignment: card.alignment } }" class="state-card">
          <span><Icon :name="card.icon" /></span><div><p>{{ card.label }}</p><strong>{{ card.value.toLocaleString() }}</strong><small>{{ card.text }}</small></div><Icon name="lucide:arrow-up-right" />
        </NuxtLink>
      </section>

      <section class="dashboard-grid">
        <article class="panel">
          <div class="panel-heading"><div><h2>Delta workflow</h2><p>Forms grouped by their current status</p></div><Icon name="lucide:activity" /></div>
          <div class="bars">
            <div v-for="item in data.statuses" :key="item.label" class="bar-row">
              <span>{{ item.label }}</span><div class="bar-track"><i :class="`workflow-${item.label.toLowerCase()}`" :style="{ width: `${item.value / maxStatus * 100}%` }" /></div><strong>{{ item.value }}</strong>
            </div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading"><div><h2>Expected risk</h2><p>Defaults plus explicit PCN overrides</p></div><Icon name="lucide:gauge" /></div>
          <div class="risk-summary">
            <div v-for="item in data.risk" :key="item.label"><RiskBadge :risk="item.label" /><strong>{{ item.value.toLocaleString() }}</strong><small>records</small></div>
          </div>
          <div v-if="data.totals.unresolvedItems" class="mini-alert"><Icon name="lucide:triangle-alert" /> {{ data.totals.unresolvedItems }} unresolved source {{ data.totals.unresolvedItems === 1 ? 'line' : 'lines' }} preserved for review</div>
        </article>
      </section>

      <section class="panel mismatch-panel">
        <div class="panel-heading"><div><h2>Risk mismatches requiring review</h2><p>Expected risk from TI change type compared with Delta NOTIFY</p></div><NuxtLink :to="{ path: '/pcns', query: { riskAlignment: 'MISMATCH' } }">View all {{ data.totals.riskMismatches }} <Icon name="lucide:arrow-right" /></NuxtLink></div>
        <div class="table-wrap"><table><thead><tr><th>PCN number</th><th>Title</th><th>Expected</th><th>Delta label</th><th>Upload coverage</th><th /></tr></thead><tbody>
          <tr v-for="pcn in data.mismatches" :key="pcn.id"><td><NuxtLink :to="`/pcns/${pcn.id}`" class="mono-link">{{ pcn.pcn_number_base }}</NuxtLink></td><td class="title-cell">{{ pcn.title }}</td><td class="fill-cell" :class="`fill-${pcn.expected_risk.toLowerCase()}`"><RiskBadge :risk="pcn.expected_risk" /></td><td class="fill-cell fill-delta"><span class="status-pill">{{ pcn.delta_risks }}</span></td><td class="fill-cell" :class="`fill-${pcn.upload_state.toLowerCase().replaceAll('_', '-')}`"><StateBadge :state="pcn.upload_state" /> <small class="coverage-count">{{ pcn.uploaded_parts }}/{{ pcn.delta_relevant_parts }}</small></td><td><NuxtLink :to="`/pcns/${pcn.id}`" class="icon-button"><Icon name="lucide:chevron-right" /></NuxtLink></td></tr>
        </tbody></table></div>
      </section>

      <section class="panel recent-panel">
        <div class="panel-heading"><div><h2>Recent notifications</h2><p>Latest PCNs by notification date</p></div><NuxtLink to="/pcns">View all <Icon name="lucide:arrow-right" /></NuxtLink></div>
        <div class="table-wrap">
          <table><thead><tr><th>PCN number</th><th>Title</th><th>Date</th><th>Risk</th><th>TI parts</th><th /></tr></thead>
            <tbody><tr v-for="pcn in data.recent" :key="pcn.id">
              <td><NuxtLink :to="`/pcns/${pcn.id}`" class="mono-link">{{ pcn.pcn_number_base }}</NuxtLink></td>
              <td class="title-cell">{{ pcn.title }}</td><td>{{ pcn.notification_date || '—' }}</td><td class="fill-cell" :class="`fill-${pcn.risk.toLowerCase()}`"><RiskBadge :risk="pcn.risk" /></td><td>{{ pcn.part_count }}</td>
              <td><NuxtLink :to="`/pcns/${pcn.id}`" class="icon-button"><Icon name="lucide:chevron-right" /></NuxtLink></td>
            </tr></tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
