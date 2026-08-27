import { run } from '../../../../utils/db'

export default defineEventHandler((event) => {
  const pcnId = Number(getRouterParam(event, 'id'))
  const partId = Number(getRouterParam(event, 'partId'))
  const result = run('DELETE FROM pcn_ti_part WHERE pcn_id = ? AND ti_part_id = ?', pcnId, partId)
  if (!result.changes) throw createError({ statusCode: 404, statusMessage: 'Part relationship not found' })
  setResponseStatus(event, 204)
  return null
})
