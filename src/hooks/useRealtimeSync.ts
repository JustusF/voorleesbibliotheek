import { useEffect, useCallback, useRef } from 'react'
import {
  subscribeToBooks,
  subscribeToChapters,
  subscribeToRecordings,
  subscribeToProgress,
  isSupabaseConfigured,
  type ChapterProgress,
} from '../lib/storage'
import type { Book, Chapter, Recording } from '../types'

interface UseRealtimeSyncOptions {
  onBooksChange?: () => void
  onChaptersChange?: () => void
  onRecordingsChange?: () => void
  onProgressChange?: (chapterId: string, progress: ChapterProgress) => void
}

/**
 * Hook that subscribes to real-time database changes.
 * Automatically syncs data across multiple devices.
 */
export function useRealtimeSync(options: UseRealtimeSyncOptions = {}) {
  const { onBooksChange, onChaptersChange, onRecordingsChange, onProgressChange } = options
  const unsubscribeRefs = useRef<((() => void) | null)[]>([])

  const handleBookChange = useCallback(
    (payload: { new: Book; old: Book | null; eventType: string }) => {
      console.log('[Realtime] Books changed:', payload.eventType)
      onBooksChange?.()
    },
    [onBooksChange]
  )

  const handleChapterChange = useCallback(
    (payload: { new: Chapter; old: Chapter | null; eventType: string }) => {
      console.log('[Realtime] Chapters changed:', payload.eventType)
      onChaptersChange?.()
    },
    [onChaptersChange]
  )

  const handleRecordingChange = useCallback(
    (payload: { new: Recording; old: Recording | null; eventType: string }) => {
      console.log('[Realtime] Recordings changed:', payload.eventType)
      onRecordingsChange?.()
    },
    [onRecordingsChange]
  )

  const handleProgressChange = useCallback(
    (payload: { new: ChapterProgress & { chapter_id: string }; eventType: string }) => {
      console.log('[Realtime] Progress changed:', payload.eventType)
      if (payload.new) {
        onProgressChange?.(payload.new.chapter_id, {
          chapterId: payload.new.chapterId,
          recordingId: payload.new.recordingId,
          currentTime: payload.new.currentTime,
          duration: payload.new.duration,
          completed: payload.new.completed,
          lastPlayed: payload.new.lastPlayed,
        })
      }
    },
    [onProgressChange]
  )

  useEffect(() => {
    if (!isSupabaseConfigured) {
      console.log('[Realtime] Supabase not configured, skipping subscriptions')
      return
    }

    console.log('[Realtime] Setting up subscriptions...')

    // Subscribe to all tables
    const unsubBooks = subscribeToBooks(handleBookChange)
    const unsubChapters = subscribeToChapters(handleChapterChange)
    const unsubRecordings = subscribeToRecordings(handleRecordingChange)
    const unsubProgress = subscribeToProgress(handleProgressChange)

    unsubscribeRefs.current = [unsubBooks, unsubChapters, unsubRecordings, unsubProgress]

    // Cleanup on unmount
    return () => {
      console.log('[Realtime] Cleaning up subscriptions...')
      unsubscribeRefs.current.forEach((unsub) => unsub?.())
      unsubscribeRefs.current = []
    }
  }, [handleBookChange, handleChapterChange, handleRecordingChange, handleProgressChange])
}

/**
 * Hook specifically for syncing books data.
 */
export function useRealtimeBooks(onBooksChange: () => void) {
  useEffect(() => {
    if (!isSupabaseConfigured) return

    const unsubscribe = subscribeToBooks(() => {
      onBooksChange()
    })

    return () => {
      unsubscribe?.()
    }
  }, [onBooksChange])
}

/**
 * Hook specifically for syncing recordings data.
 */
export function useRealtimeRecordings(onRecordingsChange: () => void) {
  useEffect(() => {
    if (!isSupabaseConfigured) return

    const unsubscribe = subscribeToRecordings(() => {
      onRecordingsChange()
    })

    return () => {
      unsubscribe?.()
    }
  }, [onRecordingsChange])
}
