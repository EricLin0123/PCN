export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: ['@nuxt/icon'],
  css: ['~/assets/css/main.css'],
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
