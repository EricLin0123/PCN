<script setup lang="ts">
const route = useRoute()
const { data, error, refresh } = await useFetch<any>(`/api/pcns/${route.params.id}`)
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
const editing = ref(false), saving = ref(false), message = ref(''), messageType = ref('success')
const newPart = ref('')
const form = reactive<any>({})
watch(data, value => { if (value) Object.assign(form, value.pcn) }, { immediate: true })
function notify(text: string, type = 'success') { message.value = text; messageType.value = type; setTimeout(() => { message.value = '' }, 3500) }
async function savePcn() {
  saving.value = true
  try { await $fetch(`/api/pcns/${route.params.id}`, { method: 'PATCH', body: form }); await refresh(); editing.value = false; notify('PCN changes saved to SQLite.') }
  catch (e: any) { notify(e.data?.statusMessage || 'Unable to save changes.', 'error') }
  finally { saving.value = false }
}
async function addPart() {
  if (!newPart.value.trim()) return
  try { await $fetch(`/api/pcns/${route.params.id}/parts`, { method: 'POST', body: { part_number: newPart.value } }); newPart.value = ''; await refresh(); notify('TI affected part added.') }
  catch (e: any) { notify(e.data?.statusMessage || 'Unable to add part.', 'error') }
}
async function removePart(id: number) {
  await $fetch(`/api/pcns/${route.params.id}/parts/${id}`, { method: 'DELETE' }); await refresh(); notify('Part removed from this PCN.')
}
async function saveForm(delta: any) {
  try { await $fetch(`/api/delta-forms/${delta.id}`, { method: 'PATCH', body: delta }); await refresh(); notify(`Delta form ${delta.form_no} updated.`) }
  catch (e: any) { notify(e.data?.statusMessage || 'Unable to update Delta form.', 'error') }
}
</script>

<template>
  <div class="page">
    <div v-if="error" class="alert error">PCN not found. <NuxtLink to="/pcns">Return to records</NuxtLink></div>
    <template v-else-if="data">
      <header class="detail-header">
        <div><NuxtLink to="/pcns" class="back-link"><Icon name="lucide:arrow-left" /> PCN records</NuxtLink><div class="detail-title"><h1>{{ data.pcn.pcn_number_base }}</h1><RiskBadge :risk="data.pcn.expected_risk" /></div><p>{{ data.pcn.title }}</p></div>
        <button class="button" :class="editing ? 'secondary' : 'primary'" @click="editing = !editing"><Icon :name="editing ? 'lucide:x' : 'lucide:pencil'" /> {{ editing ? 'Cancel edit' : 'Edit PCN' }}</button>
      </header>
      <Transition name="toast"><div v-if="message" class="toast" :class="messageType"><Icon :name="messageType === 'success' ? 'lucide:circle-check' : 'lucide:circle-alert'" />{{ message }}</div></Transition>

      <form v-if="editing" class="panel edit-form detail-edit" @submit.prevent="savePcn">
        <div class="form-grid"><label><span>Notification date</span><input v-model="form.notification_date" type="date" /></label><label><span>Change type</span><select v-model="form.change_type_id"><option :value="null">Unspecified</option><option v-for="type in changeTypes" :key="type.id" :value="type.id">{{ type.name }} · {{ type.default_risk }}</option></select></label></div>
        <label><span>Title</span><input v-model="form.title" required /></label>
        <div class="form-grid"><label><span>Risk override</span><select v-model="form.risk_override"><option :value="null">Use change type default</option><option>MAJOR</option><option>MINOR</option><option>UNKNOWN</option></select></label><label><span>PCN number</span><input :value="form.pcn_number_base" disabled /><small>Base number is immutable after creation</small></label></div>
        <label><span>Internal notes</span><textarea v-model="form.notes" rows="4" /></label>
        <div class="form-actions"><button class="button primary" :disabled="saving"><Icon :name="saving ? 'lucide:loader-circle' : 'lucide:save'" :class="{ spin: saving }" /> Save changes</button></div>
      </form>

      <section class="detail-grid">
        <article class="panel facts-panel"><div class="panel-heading"><div><h2>Notification facts</h2><p>Authoritative PCN metadata</p></div><Icon name="lucide:file-text" /></div>
          <dl class="facts"><div><dt>Notification date</dt><dd>{{ data.pcn.notification_date || 'Not set' }}</dd></div><div><dt>Change type</dt><dd>{{ data.pcn.change_type || 'Unspecified' }}</dd></div><div><dt>Default risk</dt><dd><RiskBadge :risk="data.pcn.default_risk" /></dd></div><div><dt>Manual override</dt><dd>{{ data.pcn.risk_override || 'None' }}</dd></div></dl>
          <div v-if="data.pcn.notes" class="notes"><strong>Internal notes</strong><p>{{ data.pcn.notes }}</p></div>
        </article>
        <article class="panel parts-panel"><div class="panel-heading"><div><h2>TI affected parts</h2><p>{{ data.parts.length }} authoritative relationships</p></div><Icon name="lucide:cpu" /></div>
          <form class="inline-form" @submit.prevent="addPart"><input v-model="newPart" placeholder="Add TI orderable part number" /><button class="button primary small"><Icon name="lucide:plus" /> Add</button></form>
          <div v-if="data.parts.length" class="part-list"><div v-for="part in data.parts" :key="part.id"><span>{{ part.display_part_number }}</span><button title="Remove relationship" @click="removePart(part.id)"><Icon name="lucide:x" /></button></div></div>
          <EmptyState v-else title="No TI parts" text="Add the authoritative affected parts for this PCN." icon="lucide:cpu" />
        </article>
      </section>

      <section class="forms-section"><div class="section-title"><div><p class="eyebrow">Delta workflow</p><h2>Associated forms</h2></div><span class="section-count">{{ data.forms.length }}</span></div>
        <article v-for="delta in data.forms" :key="delta.id" class="panel delta-card">
          <div class="delta-head"><div><strong>{{ delta.form_no }}</strong><p>{{ delta.delta_pcn_number_raw }} · Applied {{ delta.apply_date || 'date unknown' }}</p></div><span class="status-pill">{{ delta.form_status || 'UNSPECIFIED' }}</span></div>
          <div class="delta-edit"><label><span>Status</span><select v-model="delta.form_status"><option>REJECT</option><option>PROCESSING</option><option>COMPLETE</option><option>OPEN</option></select></label><label><span>Notify</span><select v-model="delta.notify"><option>MAJOR</option><option>MINOR</option><option>INFORMATIONAL</option></select></label><label class="reason-field"><span>Main change / rejection reason</span><input v-model="delta.main_change_reason" /></label><button class="icon-button save" title="Save form" @click="saveForm(delta)"><Icon name="lucide:save" /></button></div>
          <details><summary><span><Icon name="lucide:list" /> Affected materials</span><span>{{ delta.items.length }} parsed / {{ delta.total_pns ?? '—' }} declared <Icon name="lucide:chevron-down" /></span></summary>
            <div class="table-wrap"><table><thead><tr><th>#</th><th>Delta material</th><th>TI part</th><th>Parse status</th></tr></thead><tbody><tr v-for="item in delta.items" :key="item.id"><td>{{ item.sequence_number || '—' }}</td><td class="mono">{{ item.delta_part || 'NULL' }}</td><td class="mono">{{ item.ti_part_number || item.raw_line }}</td><td><span class="parse-badge" :class="item.parse_status.toLowerCase()">{{ item.parse_status }}</span></td></tr></tbody></table></div>
          </details>
        </article>
        <EmptyState v-if="!data.forms.length" title="No Delta forms linked" text="This PCN currently has no matching Delta workflow form." icon="lucide:clipboard-x" />
      </section>
    </template>
  </div>
</template>
