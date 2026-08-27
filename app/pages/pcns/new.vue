<script setup lang="ts">
const { data: changeTypes } = await useFetch<any[]>('/api/change-types')
const saving = ref(false)
const errorMessage = ref('')
const form = reactive({ pcn_number_base: '', notification_date: '', title: '', change_type_id: '', risk_override: '', notes: '' })
async function submit() {
  saving.value = true; errorMessage.value = ''
  try {
    const created: any = await $fetch('/api/pcns', { method: 'POST', body: form })
    await navigateTo(`/pcns/${created.id}`)
  } catch (error: any) { errorMessage.value = error.data?.statusMessage || 'Unable to create PCN.' }
  finally { saving.value = false }
}
</script>
<template>
  <div class="page narrow-page">
    <header class="page-header"><div><NuxtLink to="/pcns" class="back-link"><Icon name="lucide:arrow-left" /> PCN records</NuxtLink><h1>Create PCN</h1><p>Add a new notification directly to the SQLite database.</p></div></header>
    <form class="panel edit-form" @submit.prevent="submit">
      <div v-if="errorMessage" class="alert error">{{ errorMessage }}</div>
      <div class="form-grid"><label><span>PCN number</span><input v-model="form.pcn_number_base" required pattern="20[0-9]{9}" maxlength="11" placeholder="20260715001" /><small>Exactly 11 digits beginning with 20</small></label><label><span>Notification date</span><input v-model="form.notification_date" type="date" /></label></div>
      <label><span>Title</span><input v-model="form.title" required placeholder="Describe the product change" /></label>
      <div class="form-grid"><label><span>Change type</span><select v-model="form.change_type_id"><option value="">Unspecified</option><option v-for="type in changeTypes" :key="type.id" :value="type.id">{{ type.name }} · {{ type.default_risk }}</option></select></label><label><span>Risk override</span><select v-model="form.risk_override"><option value="">Use change type default</option><option>MAJOR</option><option>MINOR</option><option>UNKNOWN</option></select></label></div>
      <label><span>Internal notes</span><textarea v-model="form.notes" rows="5" placeholder="Optional context for the PCN team" /></label>
      <div class="form-actions"><NuxtLink to="/pcns" class="button secondary">Cancel</NuxtLink><button class="button primary" :disabled="saving"><Icon :name="saving ? 'lucide:loader-circle' : 'lucide:save'" :class="{ spin: saving }" /> Create PCN</button></div>
    </form>
  </div>
</template>
