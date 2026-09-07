import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { decodeDriveName, driveConfig, driveUsage, openUniqueDriveFile, removePartialUpload } from '../../utils/drive'

export default defineEventHandler(async (event) => {
  const encodedName = getRequestHeader(event, 'x-file-name')
  if (!encodedName) throw createError({ statusCode: 400, statusMessage: 'A file name is required.' })

  const requestedName = decodeDriveName(encodedName)
  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw createError({ statusCode: 400, statusMessage: 'The file size is invalid.' })
  }

  const { usedBytes } = await driveUsage()
  const { quotaBytes } = driveConfig()
  const remainingBytes = Math.max(0, quotaBytes - usedBytes)
  if (contentLength > remainingBytes) {
    throw createError({ statusCode: 413, statusMessage: 'There is not enough Drive storage for this file.' })
  }

  const target = await openUniqueDriveFile(requestedName)
  let receivedBytes = 0
  const quotaGuard = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length
      if (receivedBytes > remainingBytes) {
        callback(createError({ statusCode: 413, statusMessage: 'There is not enough Drive storage for this file.' }))
        return
      }
      callback(null, chunk)
    }
  })

  try {
    await pipeline(event.node.req, quotaGuard, target.handle.createWriteStream())
  } catch (error) {
    await target.handle.close().catch(() => undefined)
    await removePartialUpload(target.path)
    throw error
  }

  const details = await target.handle.stat().catch(() => null)
  await target.handle.close().catch(() => undefined)

  return {
    file: {
      name: target.name,
      size: details?.size ?? receivedBytes,
      modifiedAt: details?.mtime.toISOString() ?? new Date().toISOString()
    },
    renamed: target.name !== requestedName
  }
})
