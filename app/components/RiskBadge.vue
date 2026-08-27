<script setup lang="ts">
defineProps<{ risk?: string | null }>()
</script>
<template><span class="badge" :class="`risk-${(risk || 'unknown').toLowerCase()}`"><span />{{ risk || 'UNKNOWN' }}</span></template>
