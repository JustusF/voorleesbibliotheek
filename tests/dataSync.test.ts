import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to define mock before vi.mock hoisting
const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('../src/lib/supabase', () => ({
  supabase: { from: mockFrom, storage: { from: vi.fn() } },
  isSupabaseConfigured: true,
}))

vi.mock('../src/lib/storageBackend', () => ({
  getStorageBackend: () => ({ name: 'mock', isConfigured: () => false, upload: vi.fn(), delete: vi.fn(), getPublicUrl: vi.fn() }),
  isAnyStorageConfigured: () => false,
  getAudioFileInfo: () => ({ extension: '.webm', contentType: 'audio/webm' }),
  getExtensionFromUrl: () => '.webm',
}))

import { syncFromSupabase, getBooks, getChapters, getRecordings } from '../src/lib/storage'

describe('Data Sync - Data Loss Protection', () => {
  beforeEach(() => {
    localStorage.clear()
    mockFrom.mockReset()
  })

  it('preserves local-only books during sync', async () => {
    const localBook = { id: 'local-only-1', family_id: '1', title: 'Local Book', author: null, cover_url: null, created_at: '2026-01-01' }
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([localBook]))
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify([]))
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify([]))

    const remoteBook = { id: 'remote-1', family_id: '1', title: 'Remote Book', author: null, cover_url: null, created_at: '2026-01-02' }

    mockFrom.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [remoteBook], error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }))

    await syncFromSupabase()

    const books = getBooks()
    expect(books).toHaveLength(2)
    expect(books.find((b: { id: string }) => b.id === 'local-only-1')).toBeTruthy()
    expect(books.find((b: { id: string }) => b.id === 'remote-1')).toBeTruthy()
  })

  it('preserves local-only chapters during sync', async () => {
    // Parent book must exist to survive orphan cleanup
    const parentBook = { id: 'book-1', family_id: '1', title: 'Parent', author: null, cover_url: null, created_at: '2026-01-01' }
    const localChapter = { id: 'local-ch-1', book_id: 'book-1', chapter_number: 1, title: 'Local Chapter', created_at: '2026-01-01' }
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([parentBook]))
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify([localChapter]))
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify([]))

    const remoteChapter = { id: 'remote-ch-1', book_id: 'book-1', chapter_number: 2, title: 'Remote Chapter', created_at: '2026-01-02' }

    mockFrom.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [remoteChapter], error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }))

    await syncFromSupabase()

    const chapters = getChapters()
    expect(chapters).toHaveLength(2)
    expect(chapters.find((c: { id: string }) => c.id === 'local-ch-1')).toBeTruthy()
    expect(chapters.find((c: { id: string }) => c.id === 'remote-ch-1')).toBeTruthy()
  })

  it('preserves local-only recordings during sync', async () => {
    // Parent book+chapter must exist to survive orphan cleanup
    const parentBook = { id: 'book-1', family_id: '1', title: 'Parent', author: null, cover_url: null, created_at: '2026-01-01' }
    const parentChapter = { id: 'ch-1', book_id: 'book-1', chapter_number: 1, title: 'Chapter', created_at: '2026-01-01' }
    const localRecording = { id: 'local-rec-1', chapter_id: 'ch-1', reader_id: 'reader-1', audio_url: 'data:audio/webm;base64,abc', duration_seconds: 60, created_at: '2026-01-01' }
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([parentBook]))
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify([parentChapter]))
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify([localRecording]))

    const remoteRecording = { id: 'remote-rec-1', chapter_id: 'ch-1', reader_id: 'reader-2', audio_url: 'https://example.com/audio.webm', duration_seconds: 90, created_at: '2026-01-02' }

    mockFrom.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [remoteRecording], error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }))

    await syncFromSupabase()

    const recordings = getRecordings()
    expect(recordings).toHaveLength(2)
    expect(recordings.find((r: { id: string }) => r.id === 'local-rec-1')).toBeTruthy()
    expect(recordings.find((r: { id: string }) => r.id === 'remote-rec-1')).toBeTruthy()
  })

  it('remote records overwrite local records with same id', async () => {
    const localBook = { id: 'shared-1', family_id: '1', title: 'Old Title', author: null, cover_url: null, created_at: '2026-01-01' }
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([localBook]))
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify([]))
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify([]))

    const remoteBook = { id: 'shared-1', family_id: '1', title: 'Updated Title', author: null, cover_url: null, created_at: '2026-01-01' }

    mockFrom.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [remoteBook], error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }))

    await syncFromSupabase()

    const books = getBooks()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Updated Title')
  })

  it('handles empty remote response gracefully', async () => {
    const localBook = { id: 'local-1', family_id: '1', title: 'Local', author: null, cover_url: null, created_at: '2026-01-01' }
    localStorage.setItem('voorleesbibliotheek_books', JSON.stringify([localBook]))
    localStorage.setItem('voorleesbibliotheek_chapters', JSON.stringify([]))
    localStorage.setItem('voorleesbibliotheek_recordings', JSON.stringify([]))

    mockFrom.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }))

    await syncFromSupabase()

    const books = getBooks()
    expect(books).toHaveLength(1)
    expect(books[0].id).toBe('local-1')
  })
})
