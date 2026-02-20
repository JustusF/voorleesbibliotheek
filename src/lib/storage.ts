import { supabase, isSupabaseConfigured as supabaseConfigured } from './supabase'
import { getStorageBackend, isAnyStorageConfigured } from './storageBackend'
import type { Book, Chapter, Recording, User } from '../types'

// Re-export for use in App.tsx
export const isSupabaseConfigured = supabaseConfigured

// Export storage backend info for debugging/admin
export { isAnyStorageConfigured, getStorageBackend }

// ============================================
// ERROR HANDLING & RETRY UTILITIES
// ============================================

interface RetryOptions {
  maxRetries?: number
  delayMs?: number
  onRetry?: (attempt: number, error: Error) => void
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, onRetry } = options
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError)
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
      }
    }
  }

  throw lastError
}

// Queue for offline operations to sync later
interface PendingOperation {
  id: string
  table: string
  operation: 'insert' | 'update' | 'delete'
  data: Record<string, unknown>
  timestamp: string
}

const PENDING_OPS_KEY = 'voorleesbibliotheek_pending_ops'

function getPendingOperations(): PendingOperation[] {
  try {
    const stored = localStorage.getItem(PENDING_OPS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addPendingOperation(op: Omit<PendingOperation, 'id' | 'timestamp'>): void {
  const operations = getPendingOperations()
  operations.push({
    ...op,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  })
  localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(operations))
}

function clearPendingOperation(id: string): void {
  const operations = getPendingOperations().filter((op) => op.id !== id)
  localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(operations))
}

// Process pending operations when back online
export async function processPendingOperations(): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured || !supabase) return { success: 0, failed: 0 }

  const operations = getPendingOperations()
  let success = 0
  let failed = 0

  for (const op of operations) {
    try {
      if (op.operation === 'insert') {
        await supabase.from(op.table).insert(op.data)
      } else if (op.operation === 'update') {
        await supabase.from(op.table).update(op.data).eq('id', op.data.id)
      } else if (op.operation === 'delete') {
        await supabase.from(op.table).delete().eq('id', op.data.id)
      }
      clearPendingOperation(op.id)
      success++
    } catch (error) {
      console.error(`Failed to process pending operation ${op.id}:`, error)
      failed++
    }
  }

  return { success, failed }
}

// ============================================
// LOCAL STORAGE FALLBACK (when Supabase is not configured)
// ============================================

const STORAGE_KEYS = {
  books: 'voorleesbibliotheek_books',
  chapters: 'voorleesbibliotheek_chapters',
  recordings: 'voorleesbibliotheek_recordings',
  users: 'voorleesbibliotheek_users',
  progress: 'voorleesbibliotheek_progress',
}

// Progress tracking
export interface ChapterProgress {
  chapterId: string
  recordingId: string
  currentTime: number
  duration: number
  completed: boolean
  lastPlayed: string
}

// Family info
export const FAMILY_NAME = 'Familie Van Rij'

// Default users for Familie Van Rijn
const defaultUsers: User[] = [
  { id: '00000000-0000-0000-0000-000000000001', family_id: '1', name: 'Tantanne', avatar_url: null, role: 'reader', invite_code: null, created_at: new Date().toISOString() },
  { id: '00000000-0000-0000-0000-000000000002', family_id: '1', name: 'Bomma', avatar_url: null, role: 'reader', invite_code: null, created_at: new Date().toISOString() },
  { id: '00000000-0000-0000-0000-000000000003', family_id: '1', name: 'Gro', avatar_url: null, role: 'reader', invite_code: null, created_at: new Date().toISOString() },
  { id: '00000000-0000-0000-0000-000000000004', family_id: '1', name: 'Oma Magda', avatar_url: null, role: 'reader', invite_code: null, created_at: new Date().toISOString() },
  { id: '00000000-0000-0000-0000-000000000005', family_id: '1', name: 'Opa Hans', avatar_url: null, role: 'reader', invite_code: null, created_at: new Date().toISOString() },
  { id: '00000000-0000-0000-0000-000000000006', family_id: '1', name: 'Papa', avatar_url: null, role: 'admin', invite_code: null, created_at: new Date().toISOString() },
  { id: '00000000-0000-0000-0000-000000000007', family_id: '1', name: 'Mama', avatar_url: null, role: 'admin', invite_code: null, created_at: new Date().toISOString() },
]

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

function saveToStorage<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// ============================================
// BOOKS
// ============================================

export async function getBooksAsync(): Promise<Book[]> {
  if (isSupabaseConfigured && supabase) {
    const sb = supabase // Capture for closure
    try {
      const result = await withRetry(
        async () => {
          const { data, error } = await sb
            .from('books')
            .select('*')
            .order('created_at', { ascending: false })
          if (error) throw error
          return data
        },
        {
          maxRetries: 2,
          delayMs: 500,
          onRetry: (attempt, error) => {
            console.warn(`[getBooksAsync] Retry ${attempt} after error:`, error.message)
          },
        }
      )
      // Also update local storage for offline access
      if (result && result.length > 0) {
        saveToStorage(STORAGE_KEYS.books, result)
      }
      return result || []
    } catch (error) {
      console.error('Error fetching books:', error)
      // Fallback to local storage
      return loadFromStorage(STORAGE_KEYS.books, [])
    }
  }
  return loadFromStorage(STORAGE_KEYS.books, [])
}

// Synchronous version for backward compatibility
export function getBooks(): Book[] {
  return loadFromStorage(STORAGE_KEYS.books, [])
}

export function getBook(bookId: string): Book | undefined {
  return loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
    .find(b => b.id === bookId)
}

export async function addBookAsync(title: string, author?: string, coverUrl?: string): Promise<Book> {
  const newBook: Book = {
    id: crypto.randomUUID(),
    family_id: '1',
    title,
    author: author || null,
    cover_url: coverUrl || null,
    created_at: new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('books')
      .insert(newBook)
      .select()
      .single()
    if (error) {
      console.error('Error adding book:', error)
      throw error
    }
    // Also save to localStorage for offline support
    const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
    books.push(data)
    saveToStorage(STORAGE_KEYS.books, books)
    return data
  }

  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  books.push(newBook)
  saveToStorage(STORAGE_KEYS.books, books)
  return newBook
}

// Synchronous version for backward compatibility
export function addBook(title: string, author?: string, coverUrl?: string): Book {
  const newBook: Book = {
    id: crypto.randomUUID(),
    family_id: '1',
    title,
    author: author || null,
    cover_url: coverUrl || null,
    created_at: new Date().toISOString(),
  }

  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  books.push(newBook)
  saveToStorage(STORAGE_KEYS.books, books)

  // Save to Supabase asynchronously, queue if fails
  if (isSupabaseConfigured && supabase) {
    supabase.from('books').insert(newBook).then(({ error }) => {
      if (error) {
        console.error('Error syncing book to Supabase:', error)
        addPendingOperation({
          table: 'books',
          operation: 'insert',
          data: newBook as unknown as Record<string, unknown>,
        })
      }
    })
  }

  return newBook
}

export async function updateBookAsync(id: string, updates: Partial<Book>): Promise<Book | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('books')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.error('Error updating book:', error)
      return null
    }
    return data
  }

  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  const index = books.findIndex(b => b.id === id)
  if (index === -1) return null
  books[index] = { ...books[index], ...updates }
  saveToStorage(STORAGE_KEYS.books, books)
  return books[index]
}

export function updateBook(id: string, updates: Partial<Book>): Book | null {
  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  const index = books.findIndex(b => b.id === id)
  if (index === -1) return null
  books[index] = { ...books[index], ...updates }
  saveToStorage(STORAGE_KEYS.books, books)

  if (isSupabaseConfigured && supabase) {
    supabase.from('books').update(updates).eq('id', id).then(({ error }) => {
      if (error) {
        console.error('Error syncing book update to Supabase:', error)
        addPendingOperation({
          table: 'books',
          operation: 'update',
          data: { id, ...updates } as unknown as Record<string, unknown>,
        })
      }
    })
  }

  return books[index]
}

export async function deleteBookAsync(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('books').delete().eq('id', id)
    if (error) console.error('Error deleting book:', error)
  }

  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, []).filter(b => b.id !== id)
  saveToStorage(STORAGE_KEYS.books, books)
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, []).filter(c => c.book_id !== id)
  saveToStorage(STORAGE_KEYS.chapters, chapters)
}

export function deleteBook(id: string): void {
  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, []).filter(b => b.id !== id)
  saveToStorage(STORAGE_KEYS.books, books)
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, []).filter(c => c.book_id !== id)
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  if (isSupabaseConfigured && supabase) {
    supabase.from('books').delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error('Error syncing book deletion to Supabase:', error)
        addPendingOperation({
          table: 'books',
          operation: 'delete',
          data: { id },
        })
      }
    })
  }
}

// ============================================
// CHAPTERS
// ============================================

export async function getChaptersAsync(): Promise<Chapter[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .order('chapter_number', { ascending: true })
    if (error) {
      console.error('Error fetching chapters:', error)
      return []
    }
    return data || []
  }
  return loadFromStorage(STORAGE_KEYS.chapters, [])
}

export function getChapters(): Chapter[] {
  return loadFromStorage(STORAGE_KEYS.chapters, [])
}

export async function getChaptersForBookAsync(bookId: string): Promise<Chapter[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('book_id', bookId)
      .order('chapter_number', { ascending: true })
    if (error) {
      console.error('Error fetching chapters for book:', error)
      return []
    }
    return data || []
  }
  return loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
    .filter(c => c.book_id === bookId)
    .sort((a, b) => a.chapter_number - b.chapter_number)
}

export function getChaptersForBook(bookId: string): Chapter[] {
  return loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
    .filter(c => c.book_id === bookId)
    .sort((a, b) => a.chapter_number - b.chapter_number)
}

export function getChapter(chapterId: string): Chapter | undefined {
  return loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
    .find(c => c.id === chapterId)
}

export async function addChapterAsync(bookId: string, chapterNumber: number, title: string): Promise<Chapter> {
  const newChapter: Chapter = {
    id: crypto.randomUUID(),
    book_id: bookId,
    chapter_number: chapterNumber,
    title,
    created_at: new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('chapters')
      .insert(newChapter)
      .select()
      .single()
    if (error) {
      console.error('Error adding chapter:', error)
      throw error
    }
    const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
    chapters.push(data)
    saveToStorage(STORAGE_KEYS.chapters, chapters)
    return data
  }

  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  chapters.push(newChapter)
  saveToStorage(STORAGE_KEYS.chapters, chapters)
  return newChapter
}

export function addChapter(bookId: string, chapterNumber: number, title: string): Chapter {
  const newChapter: Chapter = {
    id: crypto.randomUUID(),
    book_id: bookId,
    chapter_number: chapterNumber,
    title,
    created_at: new Date().toISOString(),
  }

  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  chapters.push(newChapter)
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  if (isSupabaseConfigured && supabase) {
    supabase.from('chapters').insert(newChapter).then(({ error }) => {
      if (error) console.error('Error syncing chapter to Supabase:', error)
    })
  }

  return newChapter
}

export function addChapters(bookId: string, chapterTitles: string[]): Chapter[] {
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  const newChapters: Chapter[] = chapterTitles.map((title, index) => ({
    id: crypto.randomUUID(),
    book_id: bookId,
    chapter_number: index + 1,
    title,
    created_at: new Date().toISOString(),
  }))
  chapters.push(...newChapters)
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  if (isSupabaseConfigured && supabase) {
    supabase.from('chapters').insert(newChapters).then(({ error }) => {
      if (error) console.error('Error syncing chapters to Supabase:', error)
    })
  }

  return newChapters
}

export function updateChapter(id: string, updates: Partial<Chapter>): Chapter | null {
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  const index = chapters.findIndex(c => c.id === id)
  if (index === -1) return null
  chapters[index] = { ...chapters[index], ...updates }
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  if (isSupabaseConfigured && supabase) {
    supabase.from('chapters').update(updates).eq('id', id).then(({ error }) => {
      if (error) console.error('Error syncing chapter update to Supabase:', error)
    })
  }

  return chapters[index]
}

export async function deleteChapterAsync(id: string): Promise<void> {
  // Delete from localStorage first
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, []).filter(c => c.id !== id)
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  // Also delete any recordings for this chapter from localStorage
  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.chapter_id !== id)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  if (isSupabaseConfigured && supabase) {
    // Delete recordings first, then chapter - await both for consistency
    const { error: recError } = await supabase.from('recordings').delete().eq('chapter_id', id)
    if (recError) console.error('Error deleting recordings for chapter from Supabase:', recError)

    const { error: chapError } = await supabase.from('chapters').delete().eq('id', id)
    if (chapError) {
      console.error('Error syncing chapter deletion to Supabase:', chapError)
      // Queue for retry later
      addPendingOperation({
        table: 'chapters',
        operation: 'delete',
        data: { id },
      })
    }
  }
}

export function deleteChapter(id: string): void {
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, []).filter(c => c.id !== id)
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  // Also delete any recordings for this chapter
  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.chapter_id !== id)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  if (isSupabaseConfigured && supabase) {
    // Delete recordings first, then chapter
    supabase.from('recordings').delete().eq('chapter_id', id).then(({ error }) => {
      if (error) console.error('Error deleting recordings for chapter from Supabase:', error)
    })
    supabase.from('chapters').delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error('Error syncing chapter deletion to Supabase:', error)
        // Queue for retry later
        addPendingOperation({
          table: 'chapters',
          operation: 'delete',
          data: { id },
        })
      }
    })
  }
}

// ============================================
// RECORDINGS
// ============================================

export async function getRecordingsAsync(): Promise<Recording[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching recordings:', error)
      return []
    }
    return data || []
  }
  return loadFromStorage(STORAGE_KEYS.recordings, [])
}

export function getRecordings(): Recording[] {
  return loadFromStorage(STORAGE_KEYS.recordings, [])
}

export function getRecordingsForChapter(chapterId: string): Recording[] {
  return loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.chapter_id === chapterId)
}

/**
 * Replace an existing recording for a chapter+reader combination, or add new if none exists
 * This prevents duplicate recordings from the same reader for the same chapter
 */
export async function replaceRecordingAsync(
  chapterId: string,
  readerId: string,
  audioData: string | Blob,
  durationSeconds: number
): Promise<Recording> {
  // 1. Find existing recording for this chapter + reader combination
  const existingRecording = getRecordingsForChapter(chapterId)
    .find(r => r.reader_id === readerId)

  // 2. Delete old recording if it exists
  if (existingRecording) {
    await deleteRecording(existingRecording.id)
  }

  // 3. Add new recording
  return await addRecordingAsync(chapterId, readerId, audioData, durationSeconds)
}

export function getRecordingsForReader(readerId: string): Recording[] {
  return loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.reader_id === readerId)
}

// Upload audio to storage backend (R2 or Supabase)
async function uploadAudioToStorage(audioBlob: Blob, recordingId: string): Promise<string | null> {
  const backend = getStorageBackend()

  if (!backend.isConfigured()) {
    console.warn('[Storage] Geen storage backend geconfigureerd')
    return null
  }

  console.log(`[Storage] Uploading to ${backend.name}...`)
  const url = await backend.upload(recordingId, audioBlob)

  if (url) {
    console.log(`[Storage] Upload succesvol naar ${backend.name}`)
  } else {
    console.error(`[Storage] Upload naar ${backend.name} mislukt`)
  }

  return url
}

// Delete audio from storage backend (R2 or Supabase)
async function deleteAudioFromStorage(recordingId: string): Promise<boolean> {
  const backend = getStorageBackend()

  if (!backend.isConfigured()) {
    return false
  }

  console.log(`[Storage] Deleting from ${backend.name}...`)
  return backend.delete(recordingId)
}

export async function addRecordingAsync(
  chapterId: string,
  readerId: string,
  audioData: string | Blob,
  durationSeconds: number
): Promise<Recording> {
  const recordingId = crypto.randomUUID()
  let audioUrl: string

  // If audioData is a Blob and any storage backend is configured, upload to storage
  if (audioData instanceof Blob && isAnyStorageConfigured()) {
    let uploadedUrl = await uploadAudioToStorage(audioData, recordingId)
    // Retry once if first upload fails
    if (!uploadedUrl) {
      console.warn('[addRecordingAsync] First upload failed, retrying...')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      uploadedUrl = await uploadAudioToStorage(audioData, recordingId)
    }
    if (uploadedUrl) {
      audioUrl = uploadedUrl
    } else if (audioData.size > 4 * 1024 * 1024) {
      // >4MB won't fit in localStorage, throw instead of silent failure
      throw new Error('Upload mislukt en opname is te groot voor lokale opslag. Probeer het opnieuw.')
    } else {
      // Small enough for base64 fallback
      audioUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(audioData)
      })
    }
  } else if (audioData instanceof Blob) {
    // Convert Blob to base64 for localStorage
    audioUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(audioData)
    })
  } else {
    audioUrl = audioData
  }

  const newRecording: Recording = {
    id: recordingId,
    chapter_id: chapterId,
    reader_id: readerId,
    audio_url: audioUrl,
    duration_seconds: durationSeconds,
    created_at: new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('recordings').insert(newRecording)
    if (error) {
      console.error('Error adding recording to Supabase:', error)
      throw new Error(`Opname opslaan mislukt: ${error.message}`)
    }
  }

  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, [])
  recordings.push(newRecording)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  return newRecording
}

export function addRecording(chapterId: string, readerId: string, audioUrl: string, durationSeconds: number): Recording {
  const newRecording: Recording = {
    id: crypto.randomUUID(),
    chapter_id: chapterId,
    reader_id: readerId,
    audio_url: audioUrl,
    duration_seconds: durationSeconds,
    created_at: new Date().toISOString(),
  }

  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, [])
  recordings.push(newRecording)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  if (isSupabaseConfigured && supabase) {
    const sb = supabase // Capture for closure
    // For storage backends, we need to upload the audio if it's base64
    if (audioUrl.startsWith('data:') && isAnyStorageConfigured()) {
      // Convert base64 to blob and upload
      fetch(audioUrl)
        .then(res => res.blob())
        .then(async (blob) => {
          const uploadedUrl = await uploadAudioToStorage(blob, newRecording.id)
          const recordingToInsert = {
            ...newRecording,
            audio_url: uploadedUrl || audioUrl,
          }
          sb.from('recordings').insert(recordingToInsert).then(({ error }) => {
            if (error) console.error('Error syncing recording to Supabase:', error)
          })
        })
    } else {
      sb.from('recordings').insert(newRecording).then(({ error }) => {
        if (error) console.error('Error syncing recording to Supabase:', error)
      })
    }
  }

  return newRecording
}

export async function deleteRecordingAsync(id: string): Promise<void> {
  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.id !== id)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  // Delete from storage backend (R2 or Supabase Storage)
  if (isAnyStorageConfigured()) {
    await deleteAudioFromStorage(id)
  }

  if (isSupabaseConfigured && supabase) {
    // Delete from database
    const { error: dbError } = await supabase.from('recordings').delete().eq('id', id)
    if (dbError) {
      console.error('Error syncing recording deletion to Supabase:', dbError)
      // Queue for retry later
      addPendingOperation({
        table: 'recordings',
        operation: 'delete',
        data: { id },
      })
    }
  }
}

export function deleteRecording(id: string): void {
  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.id !== id)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  // Delete from storage backend (R2 or Supabase Storage)
  if (isAnyStorageConfigured()) {
    deleteAudioFromStorage(id).catch((error) => {
      console.error('Error deleting audio from storage:', error)
    })
  }

  if (isSupabaseConfigured && supabase) {
    // Delete from database
    supabase.from('recordings').delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error('Error syncing recording deletion to Supabase:', error)
        // Queue for retry later
        addPendingOperation({
          table: 'recordings',
          operation: 'delete',
          data: { id },
        })
      }
    })
  }
}

// ============================================
// USERS
// ============================================

export async function getUsersAsync(): Promise<User[]> {
  if (isSupabaseConfigured && supabase) {
    const sb = supabase // Capture for closure
    try {
      const result = await withRetry(
        async () => {
          const { data, error } = await sb
            .from('users')
            .select('*')
            .order('name', { ascending: true })
          if (error) throw error
          return data
        },
        {
          maxRetries: 2,
          delayMs: 500,
          onRetry: (attempt, error) => {
            console.warn(`[getUsersAsync] Retry ${attempt} after error:`, error.message)
          },
        }
      )
      // Also update local storage for offline access
      if (result && result.length > 0) {
        saveToStorage(STORAGE_KEYS.users, result)
      }
      return result || defaultUsers
    } catch (error) {
      console.error('Error fetching users:', error)
      // Fallback to local storage
      return loadFromStorage(STORAGE_KEYS.users, defaultUsers)
    }
  }
  return loadFromStorage(STORAGE_KEYS.users, defaultUsers)
}

export function getUsers(): User[] {
  const users = loadFromStorage(STORAGE_KEYS.users, defaultUsers)
  if (users.length === 0) {
    saveToStorage(STORAGE_KEYS.users, defaultUsers)
    return defaultUsers
  }
  return users
}

export function addUser(name: string, role: 'reader' | 'admin' | 'listener' = 'reader'): User {
  const newUser: User = {
    id: crypto.randomUUID(),
    family_id: '1',
    name,
    avatar_url: null,
    role,
    invite_code: null,
    created_at: new Date().toISOString(),
  }

  const users = loadFromStorage<User[]>(STORAGE_KEYS.users, defaultUsers)
  users.push(newUser)
  saveToStorage(STORAGE_KEYS.users, users)

  if (isSupabaseConfigured && supabase) {
    supabase.from('users').insert(newUser).then(({ error }) => {
      if (error) console.error('Error syncing user to Supabase:', error)
    })
  }

  return newUser
}

export function updateUser(id: string, updates: Partial<User>): User | null {
  const users = loadFromStorage<User[]>(STORAGE_KEYS.users, defaultUsers)
  const index = users.findIndex(u => u.id === id)
  if (index === -1) return null
  users[index] = { ...users[index], ...updates }
  saveToStorage(STORAGE_KEYS.users, users)

  if (isSupabaseConfigured && supabase) {
    supabase.from('users').update(updates).eq('id', id).then(({ error }) => {
      if (error) console.error('Error syncing user update to Supabase:', error)
    })
  }

  return users[index]
}

export function deleteUser(id: string): void {
  const users = loadFromStorage<User[]>(STORAGE_KEYS.users, defaultUsers).filter(u => u.id !== id)
  saveToStorage(STORAGE_KEYS.users, users)

  if (isSupabaseConfigured && supabase) {
    supabase.from('users').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('Error syncing user deletion to Supabase:', error)
    })
  }
}

export function resetUsersToDefaults(): void {
  saveToStorage(STORAGE_KEYS.users, defaultUsers)
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getBookWithChapters(bookId: string) {
  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  const book = books.find(b => b.id === bookId)
  if (!book) return null
  const chapters = getChaptersForBook(bookId)
  return { ...book, chapters }
}

export function getNextChapterNumber(bookId: string): number {
  const chapters = getChaptersForBook(bookId)
  if (chapters.length === 0) return 1
  return Math.max(...chapters.map(c => c.chapter_number)) + 1
}

export function getOrCreateNextChapter(bookId: string, chapterTitle?: string): Chapter {
  const nextNumber = getNextChapterNumber(bookId)
  const title = chapterTitle || `Hoofdstuk ${nextNumber}`
  return addChapter(bookId, nextNumber, title)
}

export function getChapterWithRecordings(chapterId: string) {
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  const chapter = chapters.find(c => c.id === chapterId)
  if (!chapter) return null
  const recordings = getRecordingsForChapter(chapterId)
  const users = getUsers()
  return {
    ...chapter,
    recordings: recordings.map(r => ({
      ...r,
      reader: users.find(u => u.id === r.reader_id),
    })),
  }
}

// ============================================
// PROGRESS TRACKING (per-listener)
// ============================================

// Active listener for progress tracking
let activeListenerId: string | null = null

export function setActiveListener(listenerId: string | null): void {
  activeListenerId = listenerId
  if (listenerId) {
    sessionStorage.setItem('voorleesbibliotheek_active_listener', listenerId)
  } else {
    sessionStorage.removeItem('voorleesbibliotheek_active_listener')
  }
}

export function getActiveListener(): string | null {
  if (activeListenerId) return activeListenerId
  const stored = sessionStorage.getItem('voorleesbibliotheek_active_listener')
  if (stored) {
    activeListenerId = stored
    return stored
  }
  return null
}

function getProgressKey(listenerId?: string): string {
  const id = listenerId || activeListenerId
  if (id) {
    return `${STORAGE_KEYS.progress}_${id}`
  }
  return STORAGE_KEYS.progress
}

export function getProgress(listenerId?: string): Record<string, ChapterProgress> {
  return loadFromStorage(getProgressKey(listenerId), {})
}

export function getChapterProgress(chapterId: string, listenerId?: string): ChapterProgress | null {
  const progress = getProgress(listenerId)
  return progress[chapterId] || null
}

export function saveChapterProgress(
  chapterId: string,
  recordingId: string,
  currentTime: number,
  duration: number,
  listenerId?: string
): void {
  const key = getProgressKey(listenerId)
  const progress = loadFromStorage<Record<string, ChapterProgress>>(key, {})
  const completed = duration > 0 && currentTime >= duration - 5
  progress[chapterId] = {
    chapterId,
    recordingId,
    currentTime,
    duration,
    completed,
    lastPlayed: new Date().toISOString(),
  }
  saveToStorage(key, progress)

  if (isSupabaseConfigured && supabase) {
    supabase.from('progress').upsert({
      chapter_id: chapterId,
      recording_id: recordingId,
      listener_id: listenerId || activeListenerId,
      playback_position: currentTime,
      duration,
      completed,
      last_played: new Date().toISOString(),
    }, { onConflict: 'chapter_id' }).then(({ error }) => {
      if (error) console.error('Error syncing progress to Supabase:', error)
    })
  }
}

// Migrate old global progress to a specific listener
export function migrateGlobalProgress(listenerId: string): void {
  const globalProgress = loadFromStorage<Record<string, ChapterProgress>>(STORAGE_KEYS.progress, {})
  if (Object.keys(globalProgress).length > 0) {
    const listenerKey = `${STORAGE_KEYS.progress}_${listenerId}`
    const existingListenerProgress = loadFromStorage<Record<string, ChapterProgress>>(listenerKey, {})
    // Only migrate if listener doesn't already have progress
    if (Object.keys(existingListenerProgress).length === 0) {
      saveToStorage(listenerKey, globalProgress)
    }
    // Clear global progress after migration
    saveToStorage(STORAGE_KEYS.progress, {})
  }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

type RealtimeCallback<T> = (payload: { new: T; old: T | null; eventType: 'INSERT' | 'UPDATE' | 'DELETE' }) => void

export function subscribeToBooks(callback: RealtimeCallback<Book>): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) return null

  const sb = supabase // Capture for closure
  const channel = sb
    .channel('books-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'books' },
      (payload) => {
        callback({
          new: payload.new as Book,
          old: payload.old as Book | null,
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        })
      }
    )
    .subscribe()

  return () => {
    sb.removeChannel(channel)
  }
}

export function subscribeToChapters(callback: RealtimeCallback<Chapter>): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) return null

  const sb = supabase // Capture for closure
  const channel = sb
    .channel('chapters-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chapters' },
      (payload) => {
        callback({
          new: payload.new as Chapter,
          old: payload.old as Chapter | null,
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        })
      }
    )
    .subscribe()

  return () => {
    sb.removeChannel(channel)
  }
}

export function subscribeToRecordings(callback: RealtimeCallback<Recording>): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) return null

  const sb = supabase // Capture for closure
  const channel = sb
    .channel('recordings-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'recordings' },
      (payload) => {
        callback({
          new: payload.new as Recording,
          old: payload.old as Recording | null,
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        })
      }
    )
    .subscribe()

  return () => {
    sb.removeChannel(channel)
  }
}

export function subscribeToProgress(callback: RealtimeCallback<ChapterProgress & { chapter_id: string }>): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) return null

  const sb = supabase // Capture for closure
  const channel = sb
    .channel('progress-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'progress' },
      (payload) => {
        const dbProgress = payload.new as {
          chapter_id: string
          recording_id: string
          playback_position: number
          duration: number
          completed: boolean
          last_played: string
        }

        // Convert database format to app format
        const appProgress: ChapterProgress & { chapter_id: string } = {
          chapter_id: dbProgress.chapter_id,
          chapterId: dbProgress.chapter_id,
          recordingId: dbProgress.recording_id,
          currentTime: dbProgress.playback_position,
          duration: dbProgress.duration,
          completed: dbProgress.completed,
          lastPlayed: dbProgress.last_played,
        }

        callback({
          new: appProgress,
          old: null,
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        })
      }
    )
    .subscribe()

  return () => {
    sb.removeChannel(channel)
  }
}

export function markChapterComplete(chapterId: string): void {
  const progress = getProgress()
  if (progress[chapterId]) {
    progress[chapterId].completed = true
    saveToStorage(STORAGE_KEYS.progress, progress)

    if (isSupabaseConfigured && supabase) {
      supabase.from('progress').update({ completed: true }).eq('chapter_id', chapterId).then(({ error }) => {
        if (error) console.error('Error syncing completion to Supabase:', error)
      })
    }
  }
}

// ============================================
// SYNC FUNCTIONS
// ============================================

// Sync local data to Supabase (call this when coming online or on app start)
export async function syncToSupabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  console.log('Syncing local data to Supabase...')

  // Sync books
  const localBooks = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  if (localBooks.length > 0) {
    const { error: booksError } = await supabase.from('books').upsert(localBooks, { onConflict: 'id' })
    if (booksError) console.error('Error syncing books:', booksError)
  }

  // Sync chapters
  const localChapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  if (localChapters.length > 0) {
    const { error: chaptersError } = await supabase.from('chapters').upsert(localChapters, { onConflict: 'id' })
    if (chaptersError) console.error('Error syncing chapters:', chaptersError)
  }

  // Sync recordings (without uploading audio - that would be too heavy)
  const localRecordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, [])
  if (localRecordings.length > 0) {
    const { error: recordingsError } = await supabase.from('recordings').upsert(localRecordings, { onConflict: 'id' })
    if (recordingsError) console.error('Error syncing recordings:', recordingsError)
  }

  console.log('Sync complete!')
}

// Sync from Supabase to local (call this on app start)
// IMPORTANT: Supabase is the source of truth - local data that doesn't exist in Supabase should be removed
export async function syncFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  console.log('Syncing from Supabase to local...')

  // First, process any pending offline operations
  const { success, failed } = await processPendingOperations()
  if (success > 0 || failed > 0) {
    console.log(`Processed pending operations: ${success} succeeded, ${failed} failed`)
  }

  // Fetch books from Supabase - Supabase is source of truth
  const { data: remoteBooks } = await supabase.from('books').select('*')
  if (remoteBooks) {
    // Use Supabase data directly (source of truth)
    saveToStorage(STORAGE_KEYS.books, remoteBooks)
  }

  // Fetch chapters from Supabase - Supabase is source of truth
  const { data: remoteChapters } = await supabase.from('chapters').select('*')
  if (remoteChapters) {
    // Use Supabase data directly (source of truth)
    saveToStorage(STORAGE_KEYS.chapters, remoteChapters)
  }

  // Fetch recordings from Supabase - Supabase is source of truth
  const { data: remoteRecordings } = await supabase.from('recordings').select('*')
  if (remoteRecordings) {
    // Use Supabase data directly (source of truth)
    saveToStorage(STORAGE_KEYS.recordings, remoteRecordings)
  }

  // Fetch users from Supabase
  const { data: remoteUsers } = await supabase.from('users').select('*')
  if (remoteUsers && remoteUsers.length > 0) {
    saveToStorage(STORAGE_KEYS.users, remoteUsers)
  }

  // Clean up any orphaned data after sync
  const { removedRecordings, removedChapters } = cleanupOrphanedData()
  if (removedRecordings > 0 || removedChapters > 0) {
    console.log(`Cleaned up orphaned data: ${removedChapters} chapters, ${removedRecordings} recordings`)
  }

  console.log('Sync from Supabase complete!')
}

// Force a complete resync from Supabase (clears local data first)
export async function forceResyncFromSupabase(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase is niet geconfigureerd' }
  }

  console.log('Force resyncing from Supabase - clearing local data first...')

  // Clear all local data
  localStorage.removeItem(STORAGE_KEYS.books)
  localStorage.removeItem(STORAGE_KEYS.chapters)
  localStorage.removeItem(STORAGE_KEYS.recordings)
  localStorage.removeItem(STORAGE_KEYS.progress)
  localStorage.removeItem(PENDING_OPS_KEY)

  // Now sync fresh from Supabase
  await syncFromSupabase()

  const books = getBooks()
  const chapters = getChapters()
  const recordings = getRecordings()

  return {
    success: true,
    message: `Hersynchronisatie voltooid: ${books.length} boeken, ${chapters.length} hoofdstukken, ${recordings.length} opnames`,
  }
}

// Clean up orphaned data (recordings without chapters, chapters without books)
export function cleanupOrphanedData(): { removedRecordings: number; removedChapters: number } {
  const books = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, [])

  const bookIds = new Set(books.map(b => b.id))

  // Remove chapters that reference non-existent books
  const validChapters = chapters.filter(c => bookIds.has(c.book_id))
  const removedChapters = chapters.length - validChapters.length

  // Update chapterIds after filtering
  const validChapterIds = new Set(validChapters.map(c => c.id))

  // Remove recordings that reference non-existent chapters
  const validRecordings = recordings.filter(r => validChapterIds.has(r.chapter_id))
  const removedRecordings = recordings.length - validRecordings.length

  if (removedChapters > 0) {
    saveToStorage(STORAGE_KEYS.chapters, validChapters)
    console.log(`Cleaned up ${removedChapters} orphaned chapters`)
  }

  if (removedRecordings > 0) {
    saveToStorage(STORAGE_KEYS.recordings, validRecordings)
    console.log(`Cleaned up ${removedRecordings} orphaned recordings`)
  }

  return { removedRecordings, removedChapters }
}
