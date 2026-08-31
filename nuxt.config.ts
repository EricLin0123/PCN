export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: ['@nuxt/icon'],
  runtimeConfig: {
    authEnabled: process.env.PCN_AUTH_ENABLED
      ? process.env.PCN_AUTH_ENABLED === 'true'
      : process.env.NODE_ENV === 'production',
    public: {
      authEnabled: process.env.PCN_AUTH_ENABLED
        ? process.env.PCN_AUTH_ENABLED === 'true'
        : process.env.NODE_ENV === 'production',
    },
  },
  css: ['~/assets/css/main.css', '~/assets/css/risk-assessments.css', '~/assets/css/operational-status.css', '~/assets/css/flat-ui.css', '~/assets/css/executive.css', '~/assets/css/parts.css', '~/assets/css/organization.css'],
  nitro: {
    externals: { external: ['node:sqlite'] },
  },
  app: {
    head: {
      title: 'PCN Workbench',
      meta: [
        { name: 'description', content: 'Product change notification tracking' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap' },
      ],
    },
  },
})
