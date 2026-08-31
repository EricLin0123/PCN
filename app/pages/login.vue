<script setup lang="ts">
definePageMeta({ layout: false })
const route = useRoute()
const { user, loaded } = useAuth()
const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

async function login() {
  submitting.value = true
  error.value = ''
  try {
    const result = await $fetch<any>('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value } })
    user.value = result.user
    loaded.value = true
    const redirect = String(route.query.redirect || '/')
    await navigateTo(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/')
  } catch (loginError: any) {
    error.value = loginError.data?.statusMessage || 'Unable to sign in.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <form class="panel login-card" @submit.prevent="login">
      <div class="login-brand"><span class="brand-mark"><Icon name="lucide:waypoints" /></span><div><strong>PCN Workbench</strong><small>TI / CSC operations</small></div></div>
      <div><p class="eyebrow">Secure access</p><h1>Sign in</h1><p>Use your assigned operator or admin account.</p></div>
      <label><span>Username</span><input v-model="username" autocomplete="username" required autofocus /></label>
      <label><span>Password</span><input v-model="password" type="password" autocomplete="current-password" required /></label>
      <div v-if="error" class="alert error">{{ error }}</div>
      <section class="login-disclaimer" aria-labelledby="responsibility-notice">
        <strong id="responsibility-notice">權責聲明 · Responsibility notice</strong>
        <p>This tool is built and maintained with love by TI Sales Eric Lin. Data are provided by colleagues at TI and partners at Delta. It is intended to support and streamline internal PCN management. Eric Lin accepts no personal responsibility or liability for PCN-related decisions, actions, omissions, or outcomes.</p>
        <p>By signing in to or using this system, you acknowledge and agree to this notice.</p>
      </section>
      <button class="button primary" :disabled="submitting"><Icon :name="submitting ? 'lucide:loader-circle' : 'lucide:log-in'" :class="{ spin: submitting }" /> {{ submitting ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </main>
</template>
