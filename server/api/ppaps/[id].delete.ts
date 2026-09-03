import { run } from '../../utils/db'

export default defineEventHandler((event) => {
  const result = run('DELETE FROM ppap WHERE id = ?', Number(getRouterParam(event, 'id')))
  if (!result.changes) throw createError({ statusCode: 404, statusMessage: 'PPAP not found' })
  setResponseStatus(event, 204)
  return null
})
