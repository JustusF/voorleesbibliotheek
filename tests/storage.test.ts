import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase (offline mode - no Supabase)
vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

vi.mock('../src/lib/storageBackend', () => ({
  getStorageBackend: () => ({ name: 'mock', isConfigured: () => false, upload: vi.fn(), delete: vi.fn(), getPublicUrl: vi.fn() }),
  isAnyStorageConfigured: () => false,
  getAudioFileInfo: () => ({ extension: '.webm', contentType: 'audio/webm' }),
  getExtensionFromUrl: () => '.webm',
}))

import {
  getBooks,
  addBook,
  updateBook,
  deleteBook,
  getChaptersForBook,
  addChapter,
  addChapters,
  deleteChapter,
  addRecording,
  getRecordingsForChapter,
  deleteRecording,
  getUsers,
  addUser,
  updateUser,
  deleteUser,
  getBookWithChapters,
  getNextChapterNumber,
  cleanupOrphanedData,
} from '../src/lib/storage'

describe('Books (localStorage mode)', () => {
  it('starts with empty books', () => {
    expect(getBooks()).toEqual([])
  })

  it('adds a book', () => {
    const book = addBook('Test Book', 'Author')
    expect(book.title).toBe('Test Book')
    expect(book.author).toBe('Author')
    expect(getBooks()).toHaveLength(1)
  })

  it('adds a book without author', () => {
    const book = addBook('No Author Book')
    expect(book.author).toBeNull()
  })

  it('updates a book', () => {
    const book = addBook('Old Title')
    const updated = updateBook(book.id, { title: 'New Title' })
    expect(updated!.title).toBe('New Title')
    expect(getBooks()[0].title).toBe('New Title')
  })

  it('returns null when updating non-existent book', () => {
    expect(updateBook('non-existent', { title: 'X' })).toBeNull()
  })

  it('deletes a book and its chapters', () => {
    const book = addBook('To Delete')
    addChapter(book.id, 1, 'Chapter 1')
    expect(getChaptersForBook(book.id)).toHaveLength(1)

    deleteBook(book.id)
    expect(getBooks()).toHaveLength(0)
    expect(getChaptersForBook(book.id)).toHaveLength(0)
  })
})

describe('Chapters (localStorage mode)', () => {
  it('adds chapters to a book', () => {
    const book = addBook('Book')
    addChapter(book.id, 1, 'Chapter 1')
    addChapter(book.id, 2, 'Chapter 2')
    const chapters = getChaptersForBook(book.id)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].chapter_number).toBe(1)
    expect(chapters[1].chapter_number).toBe(2)
  })

  it('adds multiple chapters at once', () => {
    const book = addBook('Book')
    const chapters = addChapters(book.id, ['Ch 1', 'Ch 2', 'Ch 3'])
    expect(chapters).toHaveLength(3)
    expect(chapters[0].chapter_number).toBe(1)
    expect(chapters[2].chapter_number).toBe(3)
  })

  it('deletes a chapter and its recordings', () => {
    const book = addBook('Book')
    const chapter = addChapter(book.id, 1, 'Ch 1')
    addRecording(chapter.id, 'reader-1', 'audio-url', 60)

    deleteChapter(chapter.id)
    expect(getChaptersForBook(book.id)).toHaveLength(0)
    expect(getRecordingsForChapter(chapter.id)).toHaveLength(0)
  })

  it('getNextChapterNumber returns correct number', () => {
    const book = addBook('Book')
    expect(getNextChapterNumber(book.id)).toBe(1)
    addChapter(book.id, 1, 'Ch 1')
    expect(getNextChapterNumber(book.id)).toBe(2)
    addChapter(book.id, 5, 'Ch 5')
    expect(getNextChapterNumber(book.id)).toBe(6)
  })
})

describe('Recordings (localStorage mode)', () => {
  it('adds and retrieves recordings', () => {
    const book = addBook('Book')
    const chapter = addChapter(book.id, 1, 'Ch 1')
    const recording = addRecording(chapter.id, 'reader-1', 'audio-url', 120)

    expect(recording.chapter_id).toBe(chapter.id)
    expect(recording.duration_seconds).toBe(120)

    const recordings = getRecordingsForChapter(chapter.id)
    expect(recordings).toHaveLength(1)
  })

  it('deletes a recording', () => {
    const book = addBook('Book')
    const chapter = addChapter(book.id, 1, 'Ch 1')
    const recording = addRecording(chapter.id, 'reader-1', 'audio-url', 60)

    deleteRecording(recording.id)
    expect(getRecordingsForChapter(chapter.id)).toHaveLength(0)
  })
})

describe('Users (localStorage mode)', () => {
  it('returns default users initially', () => {
    const users = getUsers()
    expect(users.length).toBeGreaterThan(0)
    expect(users[0].name).toBe('Tantanne')
  })

  it('adds a user', () => {
    const user = addUser('Test User', 'listener')
    expect(user.name).toBe('Test User')
    expect(user.role).toBe('listener')
  })

  it('updates a user', () => {
    const user = addUser('Old Name')
    const updated = updateUser(user.id, { name: 'New Name' })
    expect(updated!.name).toBe('New Name')
  })

  it('deletes a user', () => {
    const user = addUser('To Delete')
    expect(getUsers().find(u => u.id === user.id)).toBeTruthy()
    deleteUser(user.id)
    expect(getUsers().find(u => u.id === user.id)).toBeUndefined()
  })
})

describe('Helper Functions', () => {
  it('getBookWithChapters returns book with chapters', () => {
    const book = addBook('Book')
    addChapter(book.id, 1, 'Ch 1')
    addChapter(book.id, 2, 'Ch 2')

    const result = getBookWithChapters(book.id)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Book')
    expect(result!.chapters).toHaveLength(2)
  })

  it('getBookWithChapters returns null for non-existent book', () => {
    expect(getBookWithChapters('non-existent')).toBeNull()
  })

  it('cleanupOrphanedData removes orphaned chapters', () => {
    // Add a chapter without a parent book
    const chapters = [{ id: 'orphan-ch', book_id: 'non-existent-book', chapter_number: 1, title: 'Orphan', created_at: '2026-01-01' }]
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify(chapters))
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([]))
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify([]))

    const { removedChapters } = cleanupOrphanedData()
    expect(removedChapters).toBe(1)
  })

  it('cleanupOrphanedData removes orphaned recordings', () => {
    const recordings = [{ id: 'orphan-rec', chapter_id: 'non-existent-ch', reader_id: 'r1', audio_url: 'url', duration_seconds: 60, created_at: '2026-01-01' }]
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify(recordings))
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([]))
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify([]))

    const { removedRecordings } = cleanupOrphanedData()
    expect(removedRecordings).toBe(1)
  })
})
