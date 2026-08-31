import { currentUser, isAuthEnabled } from '../../utils/auth'

export default defineEventHandler((event) => ({ user: currentUser(event), authEnabled: isAuthEnabled(event) }))
