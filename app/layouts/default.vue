<script setup lang="ts">
const route = useRoute()
const links = [
  { to: '/executive', label: 'Executive summary', icon: 'lucide:list-checks' },
  { to: '/', label: 'Overview', icon: 'lucide:layout-dashboard' },
  { to: '/pcns', label: 'PCN records', icon: 'lucide:files' },
  { to: '/pcns/new', label: 'New PCN', icon: 'lucide:circle-plus' },
]
const isActive = (to: string) => to === '/' ? route.path === '/' : route.path === to || (to === '/pcns' && /^\/pcns\/\d/.test(route.path))
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
    </aside>
    <main class="main"><slot /></main>
  </div>
</template>
