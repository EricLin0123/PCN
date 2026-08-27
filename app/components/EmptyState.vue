<script setup lang="ts">
defineProps<{ title: string; text: string; icon?: string }>()
</script>
<template>
  <div class="empty-state"><Icon :name="icon || 'lucide:inbox'" /><strong>{{ title }}</strong><p>{{ text }}</p></div>
</template>
