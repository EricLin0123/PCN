<script setup lang="ts">
const route = useRoute()
const revenueFrom = ref(String(route.query.revenueFrom || '2025-08'))
const revenueTo = ref(String(route.query.revenueTo || '2026-09'))
const revenueQuery = computed(() => ({ revenueFrom: revenueFrom.value, revenueTo: revenueTo.value }))
const { data, error, refresh } = await useFetch<any>(`/api/pcns/${route.params.id}`, { query: revenueQuery, watch: [revenueQuery] })
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
const { isAdmin } = useAuth()
const editing = ref(false), saving = ref(false), message = ref(''), messageType = ref('success')
const emailPreview = ref<any>(null)
const emailCopyStatus = ref('')
const form = reactive<any>({})
const cscForm = reactive({ apply_date: '', form_no: '', pcn_no: '' })
const savingCsc = ref(false)
const deletingCsc = ref(false)
const cscUploadState = computed(() => data.value?.cscUpload?.confirmed_at
  ? 'CONFIRMED'
  : data.value?.cscUpload
    ? 'CSC_UPLOADED'
    : data.value?.pcn.upload_state === 'ALL_UPLOADED' ? 'NA' : 'NOT_UPLOADED')
const newRa = reactive({ ra_number: '', workbook_filename: '', part_numbers: [] as string[] })
const raRequests = computed(() => {
  if (!['MAJOR', 'MAJOR_D'].includes(data.value?.pcn.expected_risk)) return []
  const groups = new Map<string, any>()
  for (const part of data.value?.parts || []) {
    if (part.has_ra) continue
    const key = part.sbe1_name || ''
    if (!groups.has(key)) groups.set(key, { sbe1_name: key, champion_email: part.champion_email || '', parts: [] })
    groups.get(key).parts.push(part.display_part_number)
  }
  return [...groups.values()]
})
function raEmail(request: any) {
  const subject = `RA request for TI PCN ${data.value.pcn.pcn_number_base}`
  const teamName = request.sbe1_name || 'SBE-1'
  const body = `Dear ${teamName} team,\n\nPlease provide the risk assessment (RA) for TI PCN ${data.value.pcn.pcn_number_base}.\n\nParts involved:\n${request.parts.map((part: string) => `- ${part}`).join('\n')}\n\nThe customer is Delta, and this request is very important. Please prioritize it accordingly.\n\nThank you.`
  return { to: request.champion_email, subject, body }
}
function showEmailPreview(request: any) {
  emailPreview.value = raEmail(request)
  emailCopyStatus.value = ''
}
function closeEmailPreview() {
  emailPreview.value = null
  emailCopyStatus.value = ''
}
async function copyEmail() {
  if (!emailPreview.value) return
  const email = `To: ${emailPreview.value.to}\nSubject: ${emailPreview.value.subject}\n\n${emailPreview.value.body}`
  try {
    await navigator.clipboard.writeText(email)
    emailCopyStatus.value = 'Email copied to clipboard.'
  } catch {
    emailCopyStatus.value = 'Copy was blocked. Select the email text and copy it manually.'
  }
}
onMounted(() => window.addEventListener('keydown', handleEmailEscape))
onBeforeUnmount(() => window.removeEventListener('keydown', handleEmailEscape))
function handleEmailEscape(event: KeyboardEvent) { if (event.key === 'Escape') closeEmailPreview() }
watch(data, value => {
  if (!value) return
  Object.assign(form, value.pcn)
  Object.assign(cscForm, value.cscUpload || { apply_date: '', form_no: '', pcn_no: `${value.pcn.pcn_number_base}.` })
  for (const assessment of value.riskAssessments || []) assessment.part_numbers = assessment.parts.map((part: any) => part.normalized_part_number)
}, { immediate: true })
function notify(text: string, type = 'success') { message.value = text; messageType.value = type; setTimeout(() => { message.value = '' }, 3500) }
function formatRevenue(value: number) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
async function savePcn() {
  saving.value = true
  try { await $fetch(`/api/pcns/${route.params.id}`, { method: 'PATCH', body: form }); await refresh(); editing.value = false; notify('PCN changes saved to SQLite.') }
  catch (e: any) { notify(e.data?.statusMessage || 'Unable to save changes.', 'error') }
  finally { saving.value = false }
}
async function saveForm(delta: any) {
  try { await $fetch(`/api/delta-forms/${delta.id}`, { method: 'PATCH', body: delta }); await refresh(); notify(`Delta form ${delta.form_no} updated.`) }
  catch (e: any) { notify(e.data?.statusMessage || 'Unable to update Delta form.', 'error') }
}
async function addAssessment() {
  try {
    await $fetch(`/api/pcns/${route.params.id}/risk-assessments`, { method: 'POST', body: newRa })
    Object.assign(newRa, { ra_number: '', workbook_filename: '', part_numbers: [] })
    await refresh(); notify('Risk assessment added and linked to this PCN.')
  } catch (e: any) { notify(e.data?.statusMessage || 'Unable to add risk assessment.', 'error') }
}
async function saveAssessment(assessment: any) {
  try {
    await $fetch(`/api/risk-assessments/${assessment.id}`, { method: 'PATCH', body: assessment })
    await refresh(); notify(`RA ${assessment.ra_number} updated.`)
  } catch (e: any) { notify(e.data?.statusMessage || 'Unable to update risk assessment.', 'error') }
}
async function deleteAssessment(assessment: any) {
  if (!confirm(`Delete RA ${assessment.ra_number}? This removes the report and its part links from the database.`)) return
  try { await $fetch(`/api/risk-assessments/${assessment.id}`, { method: 'DELETE' }); await refresh(); notify(`RA ${assessment.ra_number} deleted.`) }
  catch (e: any) { notify(e.data?.statusMessage || 'Unable to delete risk assessment.', 'error') }
}
async function saveCscUpload() {
  savingCsc.value = true
  try {
    await $fetch(`/api/pcns/${route.params.id}/csc-upload`, { method: 'PUT', body: cscForm })
    await refresh()
    notify('CSC upload details recorded. An admin can now verify the upload.')
  } catch (e: any) { notify(e.data?.statusMessage || 'Unable to record the CSC upload.', 'error') }
  finally { savingCsc.value = false }
}
async function setConfirmation(confirmed: boolean) {
  try {
    await $fetch(`/api/pcns/${route.params.id}/csc-upload/confirmation`, { method: 'PATCH', body: { confirmed } })
    await refresh()
    notify(confirmed ? 'Upload confirmed by admin.' : 'Admin confirmation revoked.')
  } catch (e: any) { notify(e.data?.statusMessage || 'Unable to change confirmation.', 'error') }
}
async function deleteCscUpload() {
  if (!confirm('Delete this CSC upload record? This also removes its admin confirmation.')) return
  deletingCsc.value = true
  try {
    await $fetch(`/api/pcns/${route.params.id}/csc-upload`, { method: 'DELETE' })
    await refresh()
    notify('CSC upload record deleted.')
  } catch (e: any) { notify(e.data?.statusMessage || 'Unable to delete the CSC upload record.', 'error') }
  finally { deletingCsc.value = false }
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
          <dl class="facts"><div><dt>Notification date</dt><dd>{{ data.pcn.notification_date || 'Not set' }}</dd></div><div><dt>Change type</dt><dd>{{ data.pcn.change_type || 'Unspecified' }}</dd></div><div><dt>Expected risk</dt><dd><RiskBadge :risk="data.pcn.expected_risk" /></dd></div><div><dt>Manual override</dt><dd>{{ data.pcn.risk_override || 'None' }}</dd></div><div><dt>Upload state</dt><dd><StateBadge :state="data.pcn.upload_state" /> <small class="coverage-count">{{ data.pcn.uploaded_parts }}/{{ data.pcn.delta_relevant_parts }} Delta parts</small></dd></div><div><dt>CSC verification</dt><dd><StateBadge :state="cscUploadState" /></dd></div><div><dt>Delta risk check</dt><dd><StateBadge :state="data.pcn.risk_alignment" /> <small v-if="data.pcn.delta_risks" class="coverage-count">Delta: {{ data.pcn.delta_risks }}</small></dd></div></dl>
          <div v-if="data.pcn.notes" class="notes"><strong>Internal notes</strong><p>{{ data.pcn.notes }}</p></div>
        </article>
        <article class="panel parts-panel"><div class="panel-heading"><div><h2>TI affected parts</h2><p>{{ data.parts.length }} authoritative relationships · Total NR {{ formatRevenue(data.netRevenue) }}</p></div><Icon name="lucide:cpu" /></div>
          <div class="revenue-period"><strong>NR period</strong><label>From <input v-model="revenueFrom" type="month" /></label><label>To <input v-model="revenueTo" type="month" /></label></div>
          <ol v-if="data.parts.length" class="ti-part-list"><li v-for="part in data.parts" :key="part.id" :class="!part.has_delta_part ? 'ti-part-no-delta' : part.is_on_delta ? 'ti-part-on-delta' : 'ti-part-not-on-delta'"><span class="ti-part-pair"><strong>{{ part.display_part_number }}</strong><small>{{ part.delta_part_numbers || 'No Delta part number' }}</small><small>Industry: {{ part.industry || '—' }}</small><span class="ti-part-organization"><small>SBE: {{ part.sbe_name || '—' }}</small><small>SBE-1: {{ part.sbe1_name || '—' }}</small><small>SBE-2: {{ part.sbe2_name || '—' }}</small></span><small class="ti-part-champion">Champion: {{ part.champion_email || '—' }}</small></span><div class="ti-part-nr"><small>NR</small><strong>{{ formatRevenue(part.net_revenue) }}</strong></div></li></ol>
          <EmptyState v-else title="No TI parts" text="No authoritative TI affected parts are recorded for this PCN." icon="lucide:cpu" />
        </article>
      </section>

      <section v-if="data.cscUpload || data.pcn.upload_state !== 'ALL_UPLOADED'" class="panel csc-upload-panel">
        <div class="section-title"><div><p class="eyebrow">CSC handoff</p><h2>Upload verification</h2></div><StateBadge :state="cscUploadState" /></div>
        <p class="csc-explanation">CSC records its Delta submission here. This claim stays separate from imported Delta evidence until an admin confirms it.</p>
        <form class="csc-upload-form" @submit.prevent="saveCscUpload">
          <label><span>APPLY_DATE</span><input v-model="cscForm.apply_date" type="date" required :disabled="Boolean(data.cscUpload?.confirmed_at)" /></label>
          <label><span>FORM_NO</span><input v-model="cscForm.form_no" required placeholder="PCN10H21020230103111707" :disabled="Boolean(data.cscUpload?.confirmed_at)" /></label>
          <label><span>PCN_NO with suffix</span><input v-model="cscForm.pcn_no" required :placeholder="`${data.pcn.pcn_number_base}.0`" :disabled="Boolean(data.cscUpload?.confirmed_at)" /></label>
          <button v-if="!data.cscUpload?.confirmed_at" class="button primary" :disabled="savingCsc"><Icon :name="savingCsc ? 'lucide:loader-circle' : 'lucide:upload-check'" :class="{ spin: savingCsc }" /> {{ data.cscUpload ? 'Update CSC upload' : 'Mark CSC uploaded' }}</button>
        </form>
        <div v-if="data.cscUpload" class="csc-audit">
          <span>Marked by <strong>{{ data.cscUpload.uploaded_by || 'development user' }}</strong> at {{ data.cscUpload.uploaded_at }}</span>
          <span v-if="data.cscUpload.confirmed_at">Confirmed by <strong>{{ data.cscUpload.confirmed_by || 'development user' }}</strong> at {{ data.cscUpload.confirmed_at }}</span>
          <button class="icon-button danger" type="button" title="Delete CSC upload record" aria-label="Delete CSC upload record" :disabled="deletingCsc" @click="deleteCscUpload"><Icon :name="deletingCsc ? 'lucide:loader-circle' : 'lucide:trash-2'" :class="{ spin: deletingCsc }" /></button>
          <button v-if="isAdmin" class="button" :class="data.cscUpload.confirmed_at ? 'secondary' : 'primary'" type="button" @click="setConfirmation(!data.cscUpload.confirmed_at)"><Icon :name="data.cscUpload.confirmed_at ? 'lucide:shield-x' : 'lucide:badge-check'" /> {{ data.cscUpload.confirmed_at ? 'Revoke confirmation' : 'Confirm uploaded' }}</button>
          <small v-else>Only an admin can confirm this upload.</small>
        </div>
      </section>

      <section v-if="data.forms.length" class="panel delta-summary">
        <div class="section-title"><div><p class="eyebrow">Delta records</p><h2>Corresponding Delta forms</h2></div><span class="section-count">{{ data.forms.length }}</span></div>
        <div class="table-wrap"><table><thead><tr><th>Delta PCN number</th><th>Delta form number</th><th>Delta apply date</th><th>Delta status</th></tr></thead><tbody>
          <tr v-for="delta in data.forms" :key="delta.id"><td class="mono"><strong>{{ delta.delta_pcn_number_raw }}</strong></td><td class="mono">{{ delta.form_no }}</td><td>{{ delta.apply_date || '—' }}</td><td class="fill-cell delta-status-cell" :class="`fill-delta-${(delta.form_status || 'blank').toLowerCase()}`"><strong v-if="delta.form_status">{{ delta.form_status }}</strong></td></tr>
        </tbody></table></div>
      </section>

      <section class="ra-section">
        <div class="section-title"><div><p class="eyebrow">Risk coverage</p><h2>Risk assessments</h2></div><span class="section-count">{{ data.riskAssessments.length }}</span></div>
        <div v-if="raRequests.length" class="ra-request-list">
          <article v-for="request in raRequests" :key="request.sbe1_name || 'unassigned'" class="panel ra-request">
            <div><strong>{{ request.sbe1_name || 'SBE-1 not assigned' }}</strong><p>{{ request.parts.length }} part{{ request.parts.length === 1 ? '' : 's' }} still require RA</p></div>
            <button v-if="request.champion_email" class="button primary" type="button" @click="showEmailPreview(request)"><Icon name="lucide:mail" /> Request RA from {{ request.champion_email }}</button>
            <span v-else class="ra-contact-missing">Champion email not available</span>
          </article>
        </div>
        <form class="panel ra-add" @submit.prevent="addAssessment">
          <div><label>RA number</label><input v-model="newRa.ra_number" required placeholder="185" /></div>
          <div><label>RA workbook filename</label><input v-model="newRa.workbook_filename" placeholder="PCN_…__MPN_….xlsx" /></div>
          <div><label>Covered TI parts</label><select v-model="newRa.part_numbers" required multiple><option v-for="part in data.parts" :key="part.id" :value="part.normalized_part_number">{{ part.display_part_number }}</option></select><small>Hold Ctrl/Cmd to select multiple</small></div>
          <button class="button primary"><Icon name="lucide:plus" /> Add RA</button>
        </form>
        <div v-if="data.riskAssessments.length" class="ra-list">
          <article v-for="assessment in data.riskAssessments" :key="assessment.id" class="panel ra-card">
            <div class="ra-number"><span>RA</span><input v-model="assessment.ra_number" aria-label="RA number" /></div>
            <div class="ra-file"><label>Workbook filename</label><input v-model="assessment.workbook_filename" /></div>
            <div class="ra-parts"><label>Covered TI parts</label><select v-model="assessment.part_numbers" multiple><option v-for="part in data.parts" :key="part.id" :value="part.normalized_part_number">{{ part.display_part_number }}</option></select></div>
            <div class="ra-actions"><button class="icon-button save" title="Save risk assessment" @click="saveAssessment(assessment)"><Icon name="lucide:save" /></button><button class="icon-button danger" title="Delete risk assessment" @click="deleteAssessment(assessment)"><Icon name="lucide:trash-2" /></button></div>
          </article>
        </div>
        <EmptyState v-else title="No risk assessments" text="Add the first RA for this PCN and select the TI parts it covers." icon="lucide:shield-check" />
      </section>

      <section class="forms-section"><div class="section-title"><div><p class="eyebrow">Delta workflow</p><h2>Associated forms</h2></div><span class="section-count">{{ data.forms.length }}</span></div>
        <article v-for="delta in data.forms" :key="delta.id" class="panel delta-card">
          <div class="delta-head"><div><strong>{{ delta.form_no }}</strong><p>{{ delta.delta_pcn_number_raw }} · Applied {{ delta.apply_date || 'date unknown' }}</p></div><span class="status-pill">{{ delta.form_status || 'UNSPECIFIED' }}</span></div>
          <div class="delta-edit"><label><span>Status</span><select v-model="delta.form_status"><option>REJECT</option><option>PROCESSING</option><option>COMPLETE</option><option>OPEN</option></select></label><label><span>Notify</span><select v-model="delta.notify"><option>MAJOR</option><option>MINOR</option><option>INFORMATIONAL</option></select></label><label class="reason-field"><span>Main change / rejection reason</span><input v-model="delta.main_change_reason" /></label><button class="icon-button save" title="Save form" @click="saveForm(delta)"><Icon name="lucide:save" /></button></div>
          <details><summary><span><Icon name="lucide:list" /> Affected materials</span><span>{{ delta.items.length }} parsed / {{ delta.total_pns ?? '—' }} declared <Icon name="lucide:chevron-down" /></span></summary>
            <div class="table-wrap"><table><thead><tr><th>#</th><th>Delta material</th><th>TI part</th><th>Parse status</th></tr></thead><tbody><tr v-for="item in delta.items" :key="item.id"><td>{{ item.sequence_number || '—' }}</td><td class="mono">{{ item.delta_part || 'NULL' }}</td><td class="mono">{{ item.ti_part_number || item.raw_line }}</td><td class="fill-cell" :class="`fill-${item.parse_status.toLowerCase()}`"><span class="parse-badge" :class="item.parse_status.toLowerCase()">{{ item.parse_status }}</span></td></tr></tbody></table></div>
          </details>
        </article>
        <EmptyState v-if="!data.forms.length" title="No Delta forms linked" text="This PCN currently has no matching Delta workflow form." icon="lucide:clipboard-x" />
      </section>

      <div v-if="emailPreview" class="email-preview-backdrop" @click.self="closeEmailPreview">
        <section class="email-preview" role="dialog" aria-modal="true" aria-labelledby="email-preview-title">
          <header><div><p class="eyebrow">Outlook email boilerplate</p><h2 id="email-preview-title">Request risk assessment</h2></div><button class="icon-button" type="button" title="Close email preview" aria-label="Close email preview" @click="closeEmailPreview"><Icon name="lucide:x" /></button></header>
          <label><span>To</span><input :value="emailPreview.to" readonly @focus="($event.target as HTMLInputElement).select()" /></label>
          <label><span>Subject</span><input :value="emailPreview.subject" readonly @focus="($event.target as HTMLInputElement).select()" /></label>
          <label><span>Body</span><textarea :value="emailPreview.body" readonly rows="12" @focus="($event.target as HTMLTextAreaElement).select()" /></label>
          <footer><span class="email-copy-status" aria-live="polite">{{ emailCopyStatus }}</span><div><button class="button secondary" type="button" @click="closeEmailPreview">Close</button><button class="button primary" type="button" @click="copyEmail"><Icon name="lucide:copy" /> Copy email</button></div></footer>
        </section>
      </div>
    </template>
  </div>
</template>
