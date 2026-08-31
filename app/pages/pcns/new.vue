<script setup lang="ts">
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
const saving = ref(false)
const errorMessage = ref('')
const form = reactive({
  pcn_number_base: '', notification_date: '', title: '', change_type_id: '',
  affected_parts: '', risk_override: '', notes: '',
})

const affectedParts = computed(() => [...new Map(form.affected_parts
  .split(/[,;\r\n]+/)
  .map(part => part.trim().toUpperCase())
  .filter(Boolean)
  .map(part => [part.replace(/[^A-Z0-9]/g, ''), part] as const)
  .filter(([normalized]) => normalized)).values()])

async function submit() {
  saving.value = true
  errorMessage.value = ''
  try {
    const created: any = await $fetch('/api/pcns', {
      method: 'POST', body: { ...form, part_numbers: affectedParts.value },
    })
    await navigateTo(`/pcns/${created.id}`)
  } catch (error: any) {
    errorMessage.value = error.data?.statusMessage || 'Unable to create PCN.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page narrow-page">
    <header class="page-header"><div><NuxtLink to="/pcns" class="back-link"><Icon name="lucide:arrow-left" /> PCN records</NuxtLink><h1>Create TI PCN</h1><p>Record the notification and its authoritative TI affected parts. Delta information is added later.</p></div></header>
    <form class="panel edit-form" @submit.prevent="submit">
      <div v-if="errorMessage" class="alert error" role="alert">{{ errorMessage }}</div>
      <section class="form-section">
        <div class="form-section-heading"><Icon name="lucide:file-text" /><div><h2>TI notification</h2><p>Fields provided by the issued PCN.</p></div></div>
        <div class="form-grid"><label><span>PCN number</span><input v-model.trim="form.pcn_number_base" required inputmode="numeric" pattern="20[0-9]{9}" minlength="11" maxlength="11" placeholder="20260715001" /><small>11-digit TI base number beginning with 20; omit any suffix.</small></label><label><span>Notification date</span><input v-model="form.notification_date" type="date" required /></label></div>
        <label><span>Title</span><input v-model.trim="form.title" required placeholder="Title shown on the TI notification" /></label>
        <label><span>Change type</span><select v-model="form.change_type_id" required><option value="" disabled>Select the TI change type</option><option v-for="type in changeTypes" :key="type.id" :value="type.id">{{ type.name }} · {{ type.default_risk }}</option></select><small>The configured change type supplies the default expected risk.</small></label>
      </section>
      <section class="form-section">
        <div class="form-section-heading"><Icon name="lucide:cpu" /><div><h2>TI affected parts</h2><p>Authoritative part numbers listed by TI, before any Delta matching.</p></div></div>
        <label><span>Affected TI part numbers</span><textarea v-model="form.affected_parts" required rows="7" placeholder="TPS1234DRQ1&#10;TPS5678DGKR" /><small>Enter one part per line, or separate parts with commas or semicolons. Duplicates are removed automatically.</small></label>
        <div class="part-count" aria-live="polite"><Icon name="lucide:list-checks" /> {{ affectedParts.length }} unique TI {{ affectedParts.length === 1 ? 'part' : 'parts' }}</div>
      </section>
      <section class="form-section optional-section">
        <div class="form-section-heading"><Icon name="lucide:settings-2" /><div><h2>Internal classification</h2><p>Optional workbench metadata; no Delta data is collected here.</p></div></div>
        <label><span>Risk override</span><select v-model="form.risk_override"><option value="">Use title rule or change-type default</option><option>MAJOR</option><option>MINOR</option><option>UNKNOWN</option></select><small>Leave blank unless the calculated risk needs a manual override.</small></label>
        <label><span>Internal notes</span><textarea v-model="form.notes" rows="4" placeholder="Optional context for the PCN team" /></label>
      </section>
      <div class="form-actions"><NuxtLink to="/pcns" class="button secondary">Cancel</NuxtLink><button class="button primary" :disabled="saving || !affectedParts.length"><Icon :name="saving ? 'lucide:loader-circle' : 'lucide:save'" :class="{ spin: saving }" /> {{ saving ? 'Creating…' : 'Create PCN' }}</button></div>
    </form>
  </div>
</template>

<style scoped>
.form-section { display: grid; gap: 18px; }
.form-section + .form-section { border-top: 1px solid var(--line); padding-top: 22px; }
.form-section-heading { display: flex; align-items: center; gap: 11px; }
.form-section-heading > svg { color: var(--primary); font-size: 20px; }
.form-section-heading h2 { font-size: 16px; margin: 0 0 3px; }
.form-section-heading p { color: var(--muted); font-size: 11px; margin: 0; }
.optional-section { background: #fafbfc; margin: 0 -28px; padding: 22px 28px 0; }
.part-count { color: var(--muted); display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; }
</style>
