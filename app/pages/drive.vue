<script setup lang="ts">
interface DriveFile {
  name: string
  size: number
  modifiedAt: string
}

interface UploadItem {
  id: string
  name: string
  progress: number
  state: 'waiting' | 'uploading' | 'complete' | 'error'
  error?: string
}

const { data, status, error, refresh } = await useFetch<any>('/api/drive')
const fileInput = ref<HTMLInputElement | null>(null)
const search = ref('')
const dragging = ref(false)
const uploads = ref<UploadItem[]>([])
const deletingFiles = ref(new Set<string>())
const message = ref('')
const messageType = ref('success')

const filteredFiles = computed<DriveFile[]>(() => {
  const term = search.value.trim().toLocaleLowerCase()
  const files = data.value?.files || []
  return term ? files.filter((file: DriveFile) => file.name.toLocaleLowerCase().includes(term)) : files
})

const storagePercent = computed(() => {
  const storage = data.value?.storage
  if (!storage?.quotaBytes) return 0
  return Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)
})

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function fileIcon(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'lucide:file-text'
  if (['xlsx', 'xls', 'csv'].includes(extension || '')) return 'lucide:sheet'
  if (['doc', 'docx', 'txt'].includes(extension || '')) return 'lucide:file-type'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension || '')) return 'lucide:image'
  if (['zip', 'rar', '7z'].includes(extension || '')) return 'lucide:file-archive'
  return 'lucide:file'
}

function notify(text: string, type = 'success') {
  message.value = text
  messageType.value = type
  setTimeout(() => { message.value = '' }, 4000)
}

function uploadFile(file: File, item: UploadItem) {
  return new Promise<void>((resolve) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/drive/upload')
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) item.progress = Math.round((event.loaded / event.total) * 100)
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        const response = JSON.parse(request.responseText)
        item.name = response.file.name
        item.progress = 100
        item.state = 'complete'
      } else {
        let detail = 'Upload failed.'
        try {
          const response = JSON.parse(request.responseText)
          detail = response.statusMessage || response.message || detail
        } catch {}
        item.error = detail
        item.state = 'error'
      }
      resolve()
    })
    request.addEventListener('error', () => {
      item.error = 'The connection was interrupted.'
      item.state = 'error'
      resolve()
    })
    item.state = 'uploading'
    request.send(file)
  })
}

async function addFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList)
  if (!files.length) return

  const newItems: UploadItem[] = files.map(file => ({
    id: `${Date.now()}-${crypto.randomUUID()}`,
    name: file.name,
    progress: 0,
    state: 'waiting'
  }))
  uploads.value.unshift(...newItems)

  for (let index = 0; index < files.length; index += 1) {
    await uploadFile(files[index]!, newItems[index]!)
  }

  await refresh()
  const succeeded = newItems.filter(item => item.state === 'complete').length
  if (succeeded === files.length) notify(`${succeeded} file${succeeded === 1 ? '' : 's'} uploaded.`)
  else notify(`${succeeded} of ${files.length} files uploaded.`, 'error')
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files)
}

function downloadUrl(name: string) {
  return `/api/drive/download?name=${encodeURIComponent(name)}`
}

async function deleteFile(file: DriveFile) {
  if (!confirm(`Delete ${file.name}? This cannot be undone.`)) return

  deletingFiles.value.add(file.name)
  try {
    await $fetch('/api/drive', {
      method: 'DELETE',
      query: { name: file.name }
    })
    await refresh()
    notify(`${file.name} deleted.`)
  } catch (error: any) {
    notify(error?.data?.statusMessage || error?.data?.message || 'File could not be deleted.', 'error')
  } finally {
    deletingFiles.value.delete(file.name)
  }
}

function clearFinishedUploads() {
  uploads.value = uploads.value.filter(upload => upload.state === 'waiting' || upload.state === 'uploading')
}
</script>

<template>
  <div class="page drive-page">
    <header class="page-header drive-header">
      <div>
        <p class="eyebrow">Cloud storage</p>
        <h1>Drive</h1>
        <p>Keep shared RA files online and download them whenever they are needed.</p>
      </div>
      <button class="button primary" type="button" @click="fileInput?.click()">
        <Icon name="lucide:upload" /> Upload files
      </button>
      <input ref="fileInput" class="drive-file-input" type="file" multiple @change="addFiles(($event.target as HTMLInputElement).files || [])">
    </header>

    <Transition name="toast">
      <div v-if="message" class="toast" :class="messageType">
        <Icon :name="messageType === 'success' ? 'lucide:circle-check' : 'lucide:circle-alert'" />{{ message }}
      </div>
    </Transition>

    <section class="drive-overview">
      <div class="panel drive-storage-card">
        <span class="drive-storage-icon"><Icon name="lucide:cloud" /></span>
        <div>
          <small>Storage</small>
          <strong>{{ formatBytes(data?.storage?.usedBytes || 0) }} of {{ formatBytes(data?.storage?.quotaBytes || 0) }}</strong>
          <div class="drive-storage-track"><i :style="{ width: `${storagePercent}%` }" /></div>
          <p>{{ formatBytes(data?.storage?.availableBytes || 0) }} available</p>
        </div>
      </div>
      <div class="panel drive-count-card">
        <span><Icon name="lucide:files" /></span>
        <div><small>Files</small><strong>{{ (data?.files?.length || 0).toLocaleString() }}</strong></div>
      </div>
    </section>

    <section
      class="drive-drop-zone"
      :class="{ dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <span><Icon name="lucide:cloud-upload" /></span>
      <div><strong>Drop files here to upload</strong><p>or click to choose files from your computer</p></div>
    </section>

    <section v-if="uploads.length" class="panel drive-uploads">
      <header><strong>Uploads</strong><button type="button" @click="clearFinishedUploads">Clear finished</button></header>
      <div v-for="upload in uploads" :key="upload.id" class="drive-upload-row">
        <Icon :name="upload.state === 'error' ? 'lucide:circle-alert' : upload.state === 'complete' ? 'lucide:circle-check' : 'lucide:loader-circle'" :class="{ spin: upload.state === 'uploading' }" />
        <div><strong>{{ upload.name }}</strong><small v-if="upload.error">{{ upload.error }}</small><div v-else class="drive-upload-track"><i :style="{ width: `${upload.progress}%` }" /></div></div>
        <span>{{ upload.state === 'waiting' ? 'Waiting' : upload.state === 'uploading' ? `${upload.progress}%` : upload.state === 'complete' ? 'Done' : 'Failed' }}</span>
      </div>
    </section>

    <section class="panel drive-files-panel">
      <header class="drive-toolbar">
        <div><strong>My files</strong><small v-if="data">{{ filteredFiles.length }} file{{ filteredFiles.length === 1 ? '' : 's' }}</small></div>
        <label class="drive-search"><Icon name="lucide:search" /><input v-model="search" type="search" placeholder="Search files…"></label>
      </header>

      <div v-if="error" class="drive-error">Files could not be loaded. <button type="button" @click="refresh()">Try again</button></div>
      <div v-else-if="status === 'pending' && !data" class="table-loading"><div v-for="i in 5" :key="i" class="skeleton row" /></div>
      <div v-else-if="filteredFiles.length" class="table-wrap">
        <table class="drive-table">
          <thead><tr><th>Name</th><th>Modified</th><th>File size</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody><tr v-for="file in filteredFiles" :key="file.name">
            <td><span class="drive-file-icon"><Icon :name="fileIcon(file.name)" /></span><strong>{{ file.name }}</strong></td>
            <td>{{ formatDate(file.modifiedAt) }}</td>
            <td>{{ formatBytes(file.size) }}</td>
            <td><div class="drive-file-actions">
              <a class="button small" :href="downloadUrl(file.name)" download><Icon name="lucide:download" /> Download</a>
              <button class="icon-button danger" type="button" title="Delete file" :aria-label="`Delete ${file.name}`" :disabled="deletingFiles.has(file.name)" @click="deleteFile(file)"><Icon :name="deletingFiles.has(file.name) ? 'lucide:loader-circle' : 'lucide:trash-2'" :class="{ spin: deletingFiles.has(file.name) }" /></button>
            </div></td>
          </tr></tbody>
        </table>
      </div>
      <EmptyState v-else-if="search" title="No matching files" text="Try a different file name." icon="lucide:search-x" />
      <EmptyState v-else title="Your Drive is empty" text="Drop files above to make them available here." icon="lucide:folder-open" />
    </section>
  </div>
</template>
