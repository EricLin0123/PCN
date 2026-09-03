<script setup lang="ts">
const props = defineProps<{ state?: string | null; kind?: 'upload' | 'alignment' }>()
const label = computed(() => ({
  ALL_UPLOADED: 'All uploaded', PARTLY_UPLOADED: 'Partly uploaded', NOT_UPLOADED: 'Not uploaded',
  CSC_UPLOADED: 'CSC uploaded', CONFIRMED: 'Confirmed uploaded',
  MATCH: 'Risk matches', MISMATCH: 'Risk mismatch', NOT_ON_DELTA: 'Not on Delta',
  NOT_APPLICABLE: 'Not applicable', REVIEW: 'Review',
  NA: 'NA', MISS_ALL_RA: 'Miss all RA', PARTLY_MISS_RA: 'Partly Miss RA', FULL_RA: 'Full RA',
  NOT_REQUESTED: 'Not requested', REQUEST_SENT: 'Request sent to SBE-1', ACQUIRED: 'Acquired',
}[props.state || ''] || props.state || 'Unknown'))
</script>
<template><span class="state-badge" :class="`state-${(state || 'unknown').toLowerCase().replaceAll('_', '-')}`"><span />{{ label }}</span></template>
