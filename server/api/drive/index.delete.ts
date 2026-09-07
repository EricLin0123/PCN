import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { driveConfig, safeDriveName } from '../../utils/drive'

export default defineEventHandler(async (event) => {
  const name = safeDriveName(String(getQuery(event).name || ''))
  const path = resolve(driveConfig().root, name)

  try {
    await unlink(path)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: 'File not found.' })
    }
    if (error?.code === 'EISDIR' || error?.code === 'EPERM') {
      throw createError({ statusCode: 400, statusMessage: 'Only files can be deleted.' })
    }
    throw error
  }

  setResponseStatus(event, 204)
  return null
})
