/**
 * IndexedDB backup for recording chunks.
 * Periodically saves audio chunks during recording so that
 * long recordings survive tab crashes, iOS memory pressure,
 * and screen lock interruptions.
 */

const DB_NAME = 'voorleesbibliotheek-recording-backup'
const DB_VERSION = 1
const STORE_NAME = 'chunks'
const META_STORE = 'meta'

interface RecordingMeta {
  id: string
  chapterId?: string
  readerId?: string
  mimeType: string
  startedAt: number
  lastChunkAt: number
  chunkCount: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Start a new backup session. Clears any previous backup.
 */
export async function startBackupSession(
  sessionId: string,
  mimeType: string,
  chapterId?: string,
  readerId?: string
): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite')

    // Clear old chunks
    tx.objectStore(STORE_NAME).clear()

    // Write meta
    const meta: RecordingMeta = {
      id: sessionId,
      chapterId,
      readerId,
      mimeType,
      startedAt: Date.now(),
      lastChunkAt: Date.now(),
      chunkCount: 0,
    }
    tx.objectStore(META_STORE).put(meta)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.warn('Failed to start backup session:', err)
  }
}

/**
 * Save a chunk to the backup. Called periodically during recording.
 */
export async function saveChunkToBackup(
  sessionId: string,
  chunkIndex: number,
  data: Blob
): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite')

    // Store the chunk
    tx.objectStore(STORE_NAME).put({
      key: `${sessionId}-${chunkIndex}`,
      sessionId,
      chunkIndex,
      data,
      savedAt: Date.now(),
    })

    // Update meta
    const metaStore = tx.objectStore(META_STORE)
    const getReq = metaStore.get(sessionId)
    getReq.onsuccess = () => {
      const meta = getReq.result as RecordingMeta | undefined
      if (meta) {
        meta.lastChunkAt = Date.now()
        meta.chunkCount = chunkIndex + 1
        metaStore.put(meta)
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.warn('Failed to save chunk to backup:', err)
  }
}

/**
 * Check if there's a recoverable recording backup.
 */
export async function getRecoverableRecording(): Promise<{
  meta: RecordingMeta
  chunks: Blob[]
} | null> {
  try {
    const db = await openDB()

    // Get meta
    const metaTx = db.transaction(META_STORE, 'readonly')
    const metaReq = metaTx.objectStore(META_STORE).getAll()
    const metas = await new Promise<RecordingMeta[]>((resolve, reject) => {
      metaReq.onsuccess = () => resolve(metaReq.result)
      metaReq.onerror = () => reject(metaReq.error)
    })

    if (metas.length === 0) {
      db.close()
      return null
    }

    const meta = metas[0]

    // Must have at least 1 chunk and be less than 7 days old
    if (meta.chunkCount === 0 || Date.now() - meta.startedAt > 7 * 24 * 60 * 60 * 1000) {
      await clearBackup()
      db.close()
      return null
    }

    // Get all chunks
    const chunkTx = db.transaction(STORE_NAME, 'readonly')
    const chunkReq = chunkTx.objectStore(STORE_NAME).getAll()
    const rawChunks = await new Promise<Array<{ chunkIndex: number; data: Blob }>>((resolve, reject) => {
      chunkReq.onsuccess = () => resolve(chunkReq.result)
      chunkReq.onerror = () => reject(chunkReq.error)
    })

    db.close()

    if (rawChunks.length === 0) return null

    // Sort by index and extract blobs
    const sortedChunks = rawChunks
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(c => c.data)

    return { meta, chunks: sortedChunks }
  } catch (err) {
    console.warn('Failed to check recoverable recording:', err)
    return null
  }
}

/**
 * Clear the backup after a successful save or deliberate cancel.
 */
export async function clearBackup(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.objectStore(META_STORE).clear()
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.warn('Failed to clear backup:', err)
  }
}

/**
 * Request a Screen Wake Lock to prevent the device from sleeping during recording.
 */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ('wakeLock' in navigator) {
      const wakeLock = await navigator.wakeLock.request('screen')
      return wakeLock
    }
  } catch (err) {
    console.warn('Wake lock request failed:', err)
  }
  return null
}

/**
 * Release a Screen Wake Lock.
 */
export async function releaseWakeLock(wakeLock: WakeLockSentinel | null): Promise<void> {
  try {
    if (wakeLock) {
      await wakeLock.release()
    }
  } catch (err) {
    console.warn('Wake lock release failed:', err)
  }
}
