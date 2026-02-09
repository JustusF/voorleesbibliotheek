/**
 * Recording Lock System
 * Prevents multiple users from recording the same chapter simultaneously
 */

import { supabase, isSupabaseConfigured } from './supabase'

export interface RecordingLock {
  chapter_id: string
  reader_id: string
  reader_name: string
  locked_at: string
  expires_at: string
}

export interface LockCheckResult {
  isLocked: boolean
  lockedBy?: string
  message?: string
}

// Lock duration: 30 minutes (should be enough for most recordings)
const LOCK_DURATION_MS = 30 * 60 * 1000

// localStorage key for offline/local lock support
const LOCAL_LOCKS_KEY = 'voorleesbibliotheek_recording_locks'

/**
 * Get all current locks from localStorage
 */
function getLocalLocks(): RecordingLock[] {
  try {
    const stored = localStorage.getItem(LOCAL_LOCKS_KEY)
    const locks: RecordingLock[] = stored ? JSON.parse(stored) : []
    // Clean up expired locks automatically
    const now = new Date()
    return locks.filter(lock => new Date(lock.expires_at) > now)
  } catch {
    return []
  }
}

/**
 * Save locks to localStorage
 */
function setLocalLocks(locks: RecordingLock[]): void {
  localStorage.setItem(LOCAL_LOCKS_KEY, JSON.stringify(locks))
}

/**
 * Check if a chapter is currently being recorded by someone else
 */
export async function checkChapterLock(
  chapterId: string,
  currentReaderId: string
): Promise<LockCheckResult> {
  const now = new Date()

  // Check localStorage first (works offline too)
  const localLocks = getLocalLocks()
  const localLock = localLocks.find(
    lock =>
      lock.chapter_id === chapterId &&
      lock.reader_id !== currentReaderId &&
      new Date(lock.expires_at) > now
  )

  if (localLock) {
    return {
      isLocked: true,
      lockedBy: localLock.reader_name,
      message: `${localLock.reader_name} is dit hoofdstuk nu aan het opnemen.`,
    }
  }

  // Also check Supabase if configured (for multi-device sync)
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('recording_locks')
        .select('*')
        .eq('chapter_id', chapterId)
        .neq('reader_id', currentReaderId)
        .gt('expires_at', now.toISOString())
        .maybeSingle()

      if (data && !error) {
        return {
          isLocked: true,
          lockedBy: data.reader_name,
          message: `${data.reader_name} is dit hoofdstuk nu aan het opnemen.`,
        }
      }
    } catch (error) {
      console.warn('[RecordingLock] Kon Supabase lock niet controleren:', error)
      // Continue with local-only check
    }
  }

  return { isLocked: false }
}

/**
 * Acquire a lock before starting to record
 */
export async function acquireLock(
  chapterId: string,
  readerId: string,
  readerName: string
): Promise<boolean> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS)

  const lock: RecordingLock = {
    chapter_id: chapterId,
    reader_id: readerId,
    reader_name: readerName,
    locked_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  }

  // Always set local lock for offline support
  const localLocks = getLocalLocks().filter(
    l => !(l.chapter_id === chapterId && l.reader_id === readerId)
  )
  localLocks.push(lock)
  setLocalLocks(localLocks)

  // Also set Supabase lock if configured
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('recording_locks').upsert(
        {
          chapter_id: chapterId,
          reader_id: readerId,
          reader_name: readerName,
          locked_at: lock.locked_at,
          expires_at: lock.expires_at,
        },
        { onConflict: 'chapter_id,reader_id' }
      )

      if (error) {
        console.warn('[RecordingLock] Kon lock niet opslaan in Supabase:', error)
        // Continue anyway - local lock is still set
      }
    } catch (error) {
      console.warn('[RecordingLock] Supabase lock fout:', error)
    }
  }

  return true
}

/**
 * Release a lock after recording completes or is cancelled
 */
export async function releaseLock(
  chapterId: string,
  readerId: string
): Promise<void> {
  // Release local lock
  const localLocks = getLocalLocks().filter(
    l => !(l.chapter_id === chapterId && l.reader_id === readerId)
  )
  setLocalLocks(localLocks)

  // Release Supabase lock if configured
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('recording_locks')
        .delete()
        .eq('chapter_id', chapterId)
        .eq('reader_id', readerId)
    } catch (error) {
      console.warn('[RecordingLock] Kon Supabase lock niet vrijgeven:', error)
    }
  }
}

/**
 * Get all active locks (for UI display)
 */
export async function getActiveLocks(): Promise<RecordingLock[]> {
  const now = new Date()
  const localLocks = getLocalLocks()

  // If Supabase is configured, prefer remote locks
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('recording_locks')
        .select('*')
        .gt('expires_at', now.toISOString())

      if (data && !error) {
        return data
      }
    } catch (error) {
      console.warn('[RecordingLock] Kon locks niet ophalen:', error)
    }
  }

  return localLocks
}

/**
 * Subscribe to lock changes (for real-time updates)
 * Returns unsubscribe function or null if Supabase not configured
 */
export function subscribeToLocks(
  callback: (locks: RecordingLock[]) => void
): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) return null

  const sb = supabase

  const channel = sb
    .channel('recording_locks_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'recording_locks' },
      async () => {
        // Fetch all current locks when any change happens
        const locks = await getActiveLocks()
        callback(locks)
      }
    )
    .subscribe()

  return () => {
    sb.removeChannel(channel)
  }
}
