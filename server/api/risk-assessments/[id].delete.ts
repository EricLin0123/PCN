import { run } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const result = run('DELETE FROM risk_assessment WHERE id = ?', id)
  if (!result.changes) throw createError({ statusCode: 404, statusMessage: 'Risk assessment not found' })
  setResponseStatus(event, 204)
  return null
})
