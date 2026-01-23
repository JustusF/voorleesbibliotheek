import { supabase, isSupabaseConfigured as supabaseConfigured } from './supabase'
import type { Book, Chapter, Recording, User } from '../types'

// Re-export for use in App.tsx
export const isSupabaseConfigured = supabaseConfigured

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
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching books:', error)
      return []
    }
    return data || []
  }
  return loadFromStorage(STORAGE_KEYS.books, [])
}

// Synchronous version for backward compatibility
export function getBooks(): Book[] {
  return loadFromStorage(STORAGE_KEYS.books, [])
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

  // Also save to Supabase asynchronously
  if (isSupabaseConfigured && supabase) {
    supabase.from('books').insert(newBook).then(({ error }) => {
      if (error) console.error('Error syncing book to Supabase:', error)
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
      if (error) console.error('Error syncing book update to Supabase:', error)
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
      if (error) console.error('Error syncing book deletion to Supabase:', error)
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

export function deleteChapter(id: string): void {
  const chapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, []).filter(c => c.id !== id)
  saveToStorage(STORAGE_KEYS.chapters, chapters)

  if (isSupabaseConfigured && supabase) {
    supabase.from('chapters').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('Error syncing chapter deletion to Supabase:', error)
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

// Upload audio to Supabase Storage
async function uploadAudioToSupabase(audioBlob: Blob, recordingId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null

  const fileName = `${recordingId}.webm`
  const { data, error } = await supabase.storage
    .from('audio')
    .upload(fileName, audioBlob, {
      contentType: 'audio/webm',
      upsert: true,
    })

  if (error) {
    console.error('Error uploading audio:', error)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('audio')
    .getPublicUrl(data.path)

  return urlData.publicUrl
}

export async function addRecordingAsync(
  chapterId: string,
  readerId: string,
  audioData: string | Blob,
  durationSeconds: number
): Promise<Recording> {
  const recordingId = crypto.randomUUID()
  let audioUrl: string

  // If audioData is a Blob and Supabase is configured, upload to storage
  if (audioData instanceof Blob && isSupabaseConfigured && supabase) {
    const uploadedUrl = await uploadAudioToSupabase(audioData, recordingId)
    if (uploadedUrl) {
      audioUrl = uploadedUrl
    } else {
      // Fallback to base64 if upload fails
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
    if (error) console.error('Error adding recording to Supabase:', error)
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
    // For Supabase, we need to upload the audio if it's base64
    if (audioUrl.startsWith('data:')) {
      // Convert base64 to blob and upload
      fetch(audioUrl)
        .then(res => res.blob())
        .then(async (blob) => {
          const uploadedUrl = await uploadAudioToSupabase(blob, newRecording.id)
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

export function deleteRecording(id: string): void {
  const recordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, []).filter(r => r.id !== id)
  saveToStorage(STORAGE_KEYS.recordings, recordings)

  if (isSupabaseConfigured && supabase) {
    // Delete from storage
    supabase.storage.from('audio').remove([`${id}.webm`]).then(({ error }) => {
      if (error) console.error('Error deleting audio from storage:', error)
    })
    // Delete from database
    supabase.from('recordings').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('Error syncing recording deletion to Supabase:', error)
    })
  }
}

// ============================================
// USERS
// ============================================

export async function getUsersAsync(): Promise<User[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name', { ascending: true })
    if (error) {
      console.error('Error fetching users:', error)
      return defaultUsers
    }
    return data || defaultUsers
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

export function addUser(name: string, role: 'reader' | 'admin' = 'reader'): User {
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
// PROGRESS TRACKING
// ============================================

export function getProgress(): Record<string, ChapterProgress> {
  return loadFromStorage(STORAGE_KEYS.progress, {})
}

export function getChapterProgress(chapterId: string): ChapterProgress | null {
  const progress = getProgress()
  return progress[chapterId] || null
}

export function saveChapterProgress(
  chapterId: string,
  recordingId: string,
  currentTime: number,
  duration: number
): void {
  const progress = getProgress()
  const completed = duration > 0 && currentTime >= duration - 5
  progress[chapterId] = {
    chapterId,
    recordingId,
    currentTime,
    duration,
    completed,
    lastPlayed: new Date().toISOString(),
  }
  saveToStorage(STORAGE_KEYS.progress, progress)

  if (isSupabaseConfigured && supabase) {
    supabase.from('progress').upsert({
      chapter_id: chapterId,
      recording_id: recordingId,
      playback_position: currentTime,
      duration,
      completed,
      last_played: new Date().toISOString(),
    }, { onConflict: 'chapter_id' }).then(({ error }) => {
      if (error) console.error('Error syncing progress to Supabase:', error)
    })
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
export async function syncFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  console.log('Syncing from Supabase to local...')

  // Fetch and merge books
  const { data: remoteBooks } = await supabase.from('books').select('*')
  if (remoteBooks) {
    const localBooks = loadFromStorage<Book[]>(STORAGE_KEYS.books, [])
    const merged = mergeArrays(localBooks, remoteBooks, 'id')
    saveToStorage(STORAGE_KEYS.books, merged)
  }

  // Fetch and merge chapters
  const { data: remoteChapters } = await supabase.from('chapters').select('*')
  if (remoteChapters) {
    const localChapters = loadFromStorage<Chapter[]>(STORAGE_KEYS.chapters, [])
    const merged = mergeArrays(localChapters, remoteChapters, 'id')
    saveToStorage(STORAGE_KEYS.chapters, merged)
  }

  // Fetch and merge recordings
  const { data: remoteRecordings } = await supabase.from('recordings').select('*')
  if (remoteRecordings) {
    const localRecordings = loadFromStorage<Recording[]>(STORAGE_KEYS.recordings, [])
    const merged = mergeArrays(localRecordings, remoteRecordings, 'id')
    saveToStorage(STORAGE_KEYS.recordings, merged)
  }

  // Fetch and merge users
  const { data: remoteUsers } = await supabase.from('users').select('*')
  if (remoteUsers && remoteUsers.length > 0) {
    saveToStorage(STORAGE_KEYS.users, remoteUsers)
  }

  console.log('Sync from Supabase complete!')
}

// Helper to merge two arrays by a key, preferring items with later created_at
function mergeArrays<T extends { id: string; created_at?: string }>(local: T[], remote: T[], key: keyof T): T[] {
  const map = new Map<string, T>()

  for (const item of local) {
    map.set(item[key] as string, item)
  }

  for (const item of remote) {
    const existing = map.get(item[key] as string)
    if (!existing) {
      map.set(item[key] as string, item)
    } else if (item.created_at && existing.created_at && item.created_at > existing.created_at) {
      map.set(item[key] as string, item)
    }
  }

  return Array.from(map.values())
}
