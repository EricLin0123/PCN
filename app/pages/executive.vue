<script setup lang="ts">
const { data, status, error, refresh } = await useFetch<any>('/api/executive-summary')
const emailDraft = ref<any>(null)
const emailLoading = ref(false)
const emailTo = ref('')
const emailCopyStatus = ref('')
const emailError = ref('')

function openQueue(key: string) { navigateTo({ path: '/pcns', query: { executiveState: key } }) }
function ownerClass(owner: string) {
  if (owner === 'TI') return 'owner-ti'
  if (owner === 'Delta') return 'owner-delta'
  if (owner === 'Closed') return 'owner-closed'
  return 'owner-ti-delta'
}

async function generateProgressEmail() {
  emailLoading.value = true
  emailCopyStatus.value = ''
  emailError.value = ''
  try {
    emailDraft.value = await $fetch('/api/emails/delta-executive-progress')
  } catch (generateError: any) {
    emailError.value = generateError.data?.statusMessage || 'Unable to generate the Delta progress email.'
  } finally {
    emailLoading.value = false
  }
}

function closeProgressEmail() {
  emailDraft.value = null
  emailCopyStatus.value = ''
}

async function copyProgressEmail() {
  if (!emailDraft.value) return
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([emailDraft.value.html], { type: 'text/html' }),
        'text/plain': new Blob([emailDraft.value.text], { type: 'text/plain' }),
      })])
      emailCopyStatus.value = 'Rich email body copied. Paste it into Outlook.'
    } else {
      await navigator.clipboard.writeText(emailDraft.value.text)
      emailCopyStatus.value = 'Plain-text email body copied.'
    }
  } catch {
    emailCopyStatus.value = 'Copy was blocked. Select the preview and copy it manually.'
  }
}
</script>

<template>
  <div class="page executive-page">
    <header class="page-header"><div><p class="eyebrow">Management action board</p><h1>Executive summary</h1><p>Mutually exclusive PCN queues ordered by operational priority.</p></div><div class="page-actions"><button class="button primary" type="button" :disabled="emailLoading" @click="generateProgressEmail"><Icon :name="emailLoading ? 'lucide:loader-circle' : 'lucide:mail'" :class="{ spin: emailLoading }" />{{ emailLoading ? 'Generating…' : 'Email progress to Delta' }}</button></div></header>
    <div v-if="emailError" class="alert error">{{ emailError }}</div>
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

    <div v-if="emailDraft" class="email-preview-backdrop" @click.self="closeProgressEmail">
      <section class="email-preview executive-email-preview" role="dialog" aria-modal="true" aria-labelledby="executive-email-title">
        <header><div><p class="eyebrow">Live database draft</p><h2 id="executive-email-title">Delta PCN progress email</h2></div><button class="icon-button" type="button" title="Close" aria-label="Close email draft" @click="closeProgressEmail"><Icon name="lucide:x" /></button></header>
        <div class="executive-email-fields"><label><span>To</span><input v-model="emailTo" type="email" placeholder="Delta recipient email" /></label><label><span>Subject</span><input :value="emailDraft.subject" readonly /></label></div>
        <div class="executive-email-meta"><strong>{{ emailDraft.rowCount }} dashboard rows</strong> · {{ emailDraft.totalPcns.toLocaleString() }} PCNs · generated {{ new Date(emailDraft.generatedAt).toLocaleString() }}</div>
        <div class="executive-email-html" v-html="emailDraft.html" />
        <footer><span class="email-copy-status" aria-live="polite">{{ emailCopyStatus }}</span><div><button class="button secondary" type="button" @click="closeProgressEmail">Close</button><button class="button primary" type="button" @click="copyProgressEmail"><Icon name="lucide:copy" /> Copy rich email body</button></div></footer>
      </section>
    </div>
  </div>
</template>
