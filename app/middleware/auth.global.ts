export default defineNuxtRouteMiddleware(async (to) => {
  const { user, loaded, authEnabled, refreshAuth } = useAuth()
  if (!authEnabled.value) return to.path === '/login' ? navigateTo('/') : undefined
  if (!loaded.value) await refreshAuth()
  if (!user.value && to.path !== '/login') return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  if (user.value && to.path === '/login') return navigateTo('/')
})
