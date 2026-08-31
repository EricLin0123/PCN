<script setup lang="ts">
const route = useRoute()
const links = [
  { to: '/executive', label: 'Executive summary', icon: 'lucide:list-checks' },
  { to: '/', label: 'Overview', icon: 'lucide:layout-dashboard' },
  { to: '/pcns', label: 'PCN records', icon: 'lucide:files' },
  { to: '/parts', label: 'Parts', icon: 'lucide:cpu' },
  { to: '/SBE', label: 'SBE', icon: 'lucide:network' },
  { to: '/pcns/new', label: 'New PCN', icon: 'lucide:circle-plus' },
]
const isActive = (to: string) => to === '/' ? route.path === '/' : route.path === to || (to === '/pcns' && /^\/pcns\/\d/.test(route.path))
const { user, authEnabled, logout } = useAuth()
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <NuxtLink to="/" class="brand">
        <span class="brand-mark"><Icon name="lucide:waypoints" /></span>
        <span><strong>PCN</strong><small>Workbench</small></span>
      </NuxtLink>
      <nav>
        <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: isActive(link.to) }">
          <Icon :name="link.icon" /> <span>{{ link.label }}</span>
        </NuxtLink>
      </nav>
      <div class="source-note">
        <span class="status-dot" />
        <div><strong>SQLite connected</strong><small>Database is the source of truth</small></div>
      </div>
      <div v-if="authEnabled && user" class="session-card">
        <div><strong>{{ user.username }}</strong><small>{{ user.role }}</small></div>
        <button title="Sign out" aria-label="Sign out" @click="logout"><Icon name="lucide:log-out" /></button>
      </div>
      <div class="owner-tag">
        <strong>Eric Lin</strong>
        <a href="mailto:e-lin1@ti.com">e-lin1@ti.com</a>
      </div>
    </aside>
    <main class="main"><slot /></main>
  </div>
</template>
