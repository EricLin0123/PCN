export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: ['@nuxt/icon'],
  css: ['~/assets/css/main.css', '~/assets/css/risk-assessments.css', '~/assets/css/operational-status.css', '~/assets/css/flat-ui.css', '~/assets/css/executive.css'],
  nitro: {
    externals: { external: ['node:sqlite'] },
  },
  app: {
    head: {
      title: 'PCN Workbench',
      meta: [
        { name: 'description', content: 'Product change notification tracking' },
      ],
    },
  },
})
