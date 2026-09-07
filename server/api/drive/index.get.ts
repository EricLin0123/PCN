import { driveConfig, driveUsage } from '../../utils/drive'

export default defineEventHandler(async () => {
  const { files, usedBytes } = await driveUsage()
  const { quotaBytes } = driveConfig()

  return {
    files,
    storage: {
      usedBytes,
      quotaBytes,
      availableBytes: Math.max(0, quotaBytes - usedBytes)
    }
  }
})
