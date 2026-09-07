import { mkdir, open, readdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'

export interface DriveFile {
  name: string
  size: number
  modifiedAt: string
}

export function driveConfig() {
  const config = useRuntimeConfig()
  const configuredPath = String(process.env.PCN_DRIVE_PATH || config.driveStoragePath || 'data/drive')
  const root = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath)

  return {
    root,
    quotaBytes: Number(process.env.PCN_DRIVE_QUOTA_BYTES || config.driveQuotaBytes) || 40 * 1024 ** 3
  }
}

export async function ensureDriveRoot() {
  const { root } = driveConfig()
  await mkdir(root, { recursive: true })
  return root
}

export function safeDriveName(value: string) {
  let name: string
  try {
    name = decodeURIComponent(value).normalize('NFC').trim()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'The file name is invalid.' })
  }

  if (!name || name === '.' || name === '..' || basename(name) !== name || /[\\/\0\r\n]/.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'The file name is invalid.' })
  }
  if (Buffer.byteLength(name) > 240) {
    throw createError({ statusCode: 400, statusMessage: 'The file name is too long.' })
  }
  return name
}

export async function listDriveFiles(): Promise<DriveFile[]> {
  const root = await ensureDriveRoot()
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(entries
    .filter(entry => entry.isFile() && !entry.name.startsWith('.upload-'))
    .map(async (entry) => {
      const details = await stat(resolve(root, entry.name))
      return {
        name: entry.name,
        size: details.size,
        modifiedAt: details.mtime.toISOString()
      }
    }))

  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export async function driveUsage() {
  const files = await listDriveFiles()
  return {
    files,
    usedBytes: files.reduce((total, file) => total + file.size, 0)
  }
}

export async function openUniqueDriveFile(requestedName: string) {
  const root = await ensureDriveRoot()
  const extension = extname(requestedName)
  const stem = requestedName.slice(0, requestedName.length - extension.length)

  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const name = suffix === 0 ? requestedName : `${stem} (${suffix})${extension}`
    try {
      const handle = await open(resolve(root, name), 'wx')
      return { handle, name, path: resolve(root, name) }
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error
    }
  }

  throw createError({ statusCode: 409, statusMessage: 'Too many files share this name.' })
}

export async function removePartialUpload(path: string) {
  await unlink(path).catch(() => undefined)
}
