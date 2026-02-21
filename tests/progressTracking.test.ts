import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
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
  saveChapterProgress,
  getChapterProgress,
  getProgress,
  setActiveListener,
  getActiveListener,
  migrateGlobalProgress,
} from '../src/lib/storage'

describe('Progress Tracking', () => {
  beforeEach(() => {
    setActiveListener(null)
  })

  it('saves and retrieves chapter progress', () => {
    saveChapterProgress('chapter-1', 'rec-1', 30, 120)
    const progress = getChapterProgress('chapter-1')
    expect(progress).not.toBeNull()
    expect(progress!.currentTime).toBe(30)
    expect(progress!.duration).toBe(120)
    expect(progress!.completed).toBe(false)
  })

  it('marks chapter as completed when near end', () => {
    saveChapterProgress('chapter-1', 'rec-1', 118, 120)
    const progress = getChapterProgress('chapter-1')
    expect(progress!.completed).toBe(true)
  })

  it('does not mark as completed when >5s from end', () => {
    saveChapterProgress('chapter-1', 'rec-1', 110, 120)
    const progress = getChapterProgress('chapter-1')
    expect(progress!.completed).toBe(false)
  })

  it('saves per-listener progress with active listener', () => {
    setActiveListener('listener-1')
    saveChapterProgress('chapter-1', 'rec-1', 50, 120)

    setActiveListener('listener-2')
    saveChapterProgress('chapter-1', 'rec-1', 80, 120)

    // Each listener has own progress
    setActiveListener('listener-1')
    expect(getChapterProgress('chapter-1')!.currentTime).toBe(50)

    setActiveListener('listener-2')
    expect(getChapterProgress('chapter-1')!.currentTime).toBe(80)
  })

  it('stores and retrieves active listener from sessionStorage', () => {
    setActiveListener('listener-abc')
    expect(getActiveListener()).toBe('listener-abc')
  })

  it('clears active listener', () => {
    setActiveListener('listener-abc')
    setActiveListener(null)
    // getActiveListener checks the in-memory var, which is null
    // but also falls back to sessionStorage which was cleared
    expect(getActiveListener()).toBeNull()
  })

  it('migrates global progress to listener-specific key', () => {
    // Save global progress (no active listener)
    saveChapterProgress('chapter-1', 'rec-1', 45, 120)
    const globalProgress = getProgress()
    expect(Object.keys(globalProgress)).toHaveLength(1)

    // Migrate to listener
    migrateGlobalProgress('listener-1')

    // Global progress should be cleared
    const globalAfter = getProgress()
    expect(Object.keys(globalAfter)).toHaveLength(0)

    // Listener should have the progress
    setActiveListener('listener-1')
    const listenerProgress = getChapterProgress('chapter-1')
    expect(listenerProgress!.currentTime).toBe(45)
  })

  it('does not overwrite existing listener progress on migration', () => {
    // Set listener progress first
    setActiveListener('listener-1')
    saveChapterProgress('chapter-1', 'rec-1', 90, 120)
    setActiveListener(null)

    // Save different global progress
    saveChapterProgress('chapter-1', 'rec-1', 10, 120)

    // Migrate should NOT overwrite
    migrateGlobalProgress('listener-1')

    setActiveListener('listener-1')
    expect(getChapterProgress('chapter-1')!.currentTime).toBe(90)
  })

  it('updates lastPlayed timestamp', () => {
    const before = new Date().toISOString()
    saveChapterProgress('chapter-1', 'rec-1', 30, 120)
    const progress = getChapterProgress('chapter-1')
    expect(progress!.lastPlayed >= before).toBe(true)
  })
})
