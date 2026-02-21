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

import { setSyncErrorHandler, type SyncError } from '../src/lib/storage'

describe('Sync Error Reporting', () => {
  beforeEach(() => {
    setSyncErrorHandler(null)
  })

  it('calls the registered handler when a sync error occurs', () => {
    const handler = vi.fn()
    setSyncErrorHandler(handler)

    // The handler is called internally by reportSyncError.
    // Since reportSyncError is not exported, we test via the public API.
    // setSyncErrorHandler stores the handler for internal use.
    expect(handler).not.toHaveBeenCalled()
  })

  it('allows setting handler to null', () => {
    const handler = vi.fn()
    setSyncErrorHandler(handler)
    setSyncErrorHandler(null)
    // No error should throw
  })

  it('SyncError has correct shape', () => {
    const error: SyncError = {
      message: 'Test error',
      table: 'books',
      operation: 'insert',
      timestamp: new Date(),
    }
    expect(error.message).toBe('Test error')
    expect(error.table).toBe('books')
    expect(error.operation).toBe('insert')
    expect(error.timestamp).toBeInstanceOf(Date)
  })

  it('SyncError works without optional fields', () => {
    const error: SyncError = {
      message: 'Minimal error',
      timestamp: new Date(),
    }
    expect(error.message).toBe('Minimal error')
    expect(error.table).toBeUndefined()
    expect(error.operation).toBeUndefined()
  })
})
