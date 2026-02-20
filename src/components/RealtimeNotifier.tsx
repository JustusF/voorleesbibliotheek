import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from './ui'

/**
 * Watches for new books, chapters, and recordings arriving via
 * Supabase Realtime subscriptions and shows toast notifications.
 * Skips the initial load so users don't get spammed on app open.
 */
export function RealtimeNotifier() {
  const { state } = useApp()
  const { showToast } = useToast()

  const prevBooksRef = useRef<number | null>(null)
  const prevChaptersRef = useRef<number | null>(null)
  const prevRecordingsRef = useRef<number | null>(null)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    // Skip until initial data load is done
    if (!state.isInitialized) return

    // First render after init: just record counts, don't notify
    if (!isInitializedRef.current) {
      prevBooksRef.current = state.books.length
      prevChaptersRef.current = state.chapters.length
      prevRecordingsRef.current = state.recordings.length
      isInitializedRef.current = true
      return
    }

    const prevBooks = prevBooksRef.current ?? 0
    const prevChapters = prevChaptersRef.current ?? 0
    const prevRecordings = prevRecordingsRef.current ?? 0

    // Detect new books
    if (state.books.length > prevBooks) {
      const newCount = state.books.length - prevBooks
      const newest = state.books[0] // books are ordered newest-first
      if (newCount === 1 && newest) {
        showToast(`Nieuw boek: ${newest.title}`, 'info', 6000)
      } else {
        showToast(`${newCount} nieuwe boeken toegevoegd`, 'info', 6000)
      }
    }

    // Detect new chapters
    if (state.chapters.length > prevChapters) {
      const newCount = state.chapters.length - prevChapters
      if (newCount <= 3) {
        // Find the newest chapters by comparing with previous set
        const prevIds = new Set(
          state.chapters.slice(newCount).map(c => c.id)
        )
        const newChapters = state.chapters.filter(c => !prevIds.has(c.id))
        if (newChapters.length === 1 && newChapters[0]) {
          showToast(`Nieuw hoofdstuk: ${newChapters[0].title}`, 'info', 5000)
        } else {
          showToast(`${newCount} nieuwe hoofdstukken toegevoegd`, 'info', 5000)
        }
      }
    }

    // Detect new recordings
    if (state.recordings.length > prevRecordings) {
      const newCount = state.recordings.length - prevRecordings
      if (newCount === 1) {
        // Find the reader name for the new recording
        const newest = state.recordings[0]
        const reader = newest ? state.users.find(u => u.id === newest.reader_id) : null
        const chapter = newest ? state.chapters.find(c => c.id === newest.chapter_id) : null
        if (reader && chapter) {
          showToast(`${reader.name} heeft "${chapter.title}" ingelezen`, 'success', 6000)
        } else {
          showToast('Nieuwe opname beschikbaar', 'success', 5000)
        }
      } else {
        showToast(`${newCount} nieuwe opnames beschikbaar`, 'success', 5000)
      }
    }

    prevBooksRef.current = state.books.length
    prevChaptersRef.current = state.chapters.length
    prevRecordingsRef.current = state.recordings.length
  }, [state.isInitialized, state.books, state.chapters, state.recordings, state.users, showToast])

  return null
}
