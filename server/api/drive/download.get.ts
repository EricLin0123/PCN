import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { driveConfig, safeDriveName } from '../../utils/drive'

export default defineEventHandler(async (event) => {
  const name = safeDriveName(String(getQuery(event).name || ''))
  const path = resolve(driveConfig().root, name)
  const details = await stat(path).catch(() => null)
  if (!details?.isFile()) throw createError({ statusCode: 404, statusMessage: 'File not found.' })

  const asciiName = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  setResponseHeader(event, 'content-type', 'application/octet-stream')
  setResponseHeader(event, 'content-length', details.size)
  setResponseHeader(event, 'content-disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`)
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  return sendStream(event, createReadStream(path))
})
