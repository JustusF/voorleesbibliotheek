import { describe, it, expect, vi } from 'vitest'

// Offline mode: no Supabase, no storage backend
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

import { addRecording, getRecordingsForChapter, replaceRecordingAsync } from '../src/lib/storage'

describe('replaceRecordingAsync', () => {
  it('keeps one recording per reader and chapter, with the same id and the new audio', async () => {
    const first = addRecording('chapter-1', 'reader-1', 'data:audio/webm;base64,OLD', 60)

    const replaced = await replaceRecordingAsync('chapter-1', 'reader-1', 'data:audio/webm;base64,NEW', 90)

    const recordings = getRecordingsForChapter('chapter-1')
    expect(recordings).toHaveLength(1)
    expect(replaced.id).toBe(first.id)
    expect(recordings[0].audio_url).toBe('data:audio/webm;base64,NEW')
    expect(recordings[0].duration_seconds).toBe(90)
  })

  it('leaves the recording of another reader on the same chapter alone', async () => {
    const other = addRecording('chapter-2', 'reader-2', 'data:audio/webm;base64,OTHER', 30)

    await replaceRecordingAsync('chapter-2', 'reader-1', 'data:audio/webm;base64,MINE', 45)

    const recordings = getRecordingsForChapter('chapter-2')
    expect(recordings).toHaveLength(2)
    expect(recordings.find(r => r.id === other.id)?.audio_url).toBe('data:audio/webm;base64,OTHER')
  })

  it('adds a recording when the reader had none yet', async () => {
    const added = await replaceRecordingAsync('chapter-3', 'reader-1', 'data:audio/webm;base64,FIRST', 20)

    expect(getRecordingsForChapter('chapter-3').map(r => r.id)).toEqual([added.id])
  })
})
