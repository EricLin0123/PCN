<script setup lang="ts">
const props = defineProps<{
  title: string
  items: Array<{ id: number; pcnNumber: string; netRevenue: number }>
}>()
const emit = defineEmits<{
  select: [item: { id: number; pcnNumber: string; netRevenue: number }]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: any

function colors(count: number) {
  return Array.from({ length: count }, (_, index) => `hsl(${Math.round((index * 137.508) % 360)} 68% 48%)`)
}

async function renderChart() {
  if (!canvas.value) return
  chart?.destroy()
  const { default: Chart } = await import('chart.js/auto')
  chart = new Chart(canvas.value, {
    type: 'pie',
    data: {
      labels: props.items.map(item => item.pcnNumber),
      datasets: [{
        data: props.items.map(item => item.netRevenue),
        backgroundColor: colors(props.items.length),
        borderColor: '#ffffff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(_event: unknown, elements: Array<{ index: number }>) {
        const index = elements[0]?.index
        const item = index === undefined ? undefined : props.items[index]
        if (item) emit('select', item)
      },
      onHover(_event: unknown, elements: unknown[]) {
        if (canvas.value) canvas.value.style.cursor = elements.length ? 'pointer' : 'default'
      },
      animation: { duration: 900, easing: 'easeOutQuart', animateRotate: true, animateScale: true },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          callbacks: {
            label(context: any) {
              const value = Number(context.raw || 0)
              const total = context.dataset.data.reduce((sum: number, item: number) => sum + Number(item), 0)
              const percent = total ? (value / total * 100).toFixed(1) : '0.0'
              return `${context.label}: $${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percent}%)`
            },
          },
        },
      },
    },
  })
}

onMounted(renderChart)
watch(() => props.items, () => nextTick(renderChart), { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <article class="panel executive-chart-card">
    <header><div><p class="eyebrow">Positive NR only</p><h2>{{ title }}</h2></div><strong>{{ items.length }} PCN{{ items.length === 1 ? '' : 's' }}</strong></header>
    <div v-if="items.length" class="executive-chart-canvas"><canvas ref="canvas" /><small>Click a slice to open its PCN. Hover to see NR and percentage.</small></div>
    <EmptyState v-else title="No positive NR" text="No PCNs in this queue have NR greater than $0 for this period." icon="lucide:chart-pie" />
  </article>
</template>
