export interface AuthUser { id: number | null, username: string, role: 'operator' | 'admin' }

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const loaded = useState('auth-loaded', () => false)
  const config = useRuntimeConfig()
  const authEnabled = computed(() => Boolean(config.public.authEnabled))

  async function refreshAuth() {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    const result = await $fetch<{ user: AuthUser | null }>('/api/auth/me', { headers })
    user.value = result.user
    loaded.value = true
    return result.user
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    loaded.value = true
    await navigateTo('/login')
  }

  return { user, loaded, authEnabled, refreshAuth, logout, isAdmin: computed(() => user.value?.role === 'admin') }
}
