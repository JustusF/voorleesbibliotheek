import { describe, it, expect } from 'vitest'
import { getAudioFileInfo, getExtensionFromUrl } from '../src/lib/storageBackend'

describe('getAudioFileInfo', () => {
  it('detects audio/mp4 blobs', () => {
    const blob = new Blob(['data'], { type: 'audio/mp4' })
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.mp4')
    expect(result.contentType).toBe('audio/mp4')
  })

  it('detects audio/m4a blobs', () => {
    const blob = new Blob(['data'], { type: 'audio/m4a' })
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.mp4')
    expect(result.contentType).toBe('audio/mp4')
  })

  it('detects audio/aac blobs', () => {
    const blob = new Blob(['data'], { type: 'audio/aac' })
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.mp4')
    expect(result.contentType).toBe('audio/mp4')
  })

  it('detects video/mp4 blobs (WhatsApp audio)', () => {
    const blob = new Blob(['data'], { type: 'video/mp4' })
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.mp4')
    expect(result.contentType).toBe('audio/mp4')
  })

  it('defaults to webm for audio/webm blobs', () => {
    const blob = new Blob(['data'], { type: 'audio/webm' })
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.webm')
    expect(result.contentType).toBe('audio/webm')
  })

  it('defaults to webm for blobs without type', () => {
    const blob = new Blob(['data'])
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.webm')
    expect(result.contentType).toBe('audio/webm')
  })

  it('is case-insensitive', () => {
    const blob = new Blob(['data'], { type: 'Audio/MP4' })
    const result = getAudioFileInfo(blob)
    expect(result.extension).toBe('.mp4')
  })
})

describe('getExtensionFromUrl', () => {
  it('detects .mp4 from Supabase URL', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/audio/recording-id.mp4'
    expect(getExtensionFromUrl(url)).toBe('.mp4')
  })

  it('defaults to .webm for Supabase URL', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/audio/recording-id.webm'
    expect(getExtensionFromUrl(url)).toBe('.webm')
  })

  it('detects .mp4 from R2 URL', () => {
    const url = 'https://pub-abc.r2.dev/recording-id.mp4'
    expect(getExtensionFromUrl(url)).toBe('.mp4')
  })

  it('defaults to .webm for unknown URLs', () => {
    const url = 'https://example.com/audio'
    expect(getExtensionFromUrl(url)).toBe('.webm')
  })

  it('defaults to .webm for non-URL strings', () => {
    expect(getExtensionFromUrl('not-a-url')).toBe('.webm')
  })

  it('handles base64 data URLs', () => {
    expect(getExtensionFromUrl('data:audio/webm;base64,abc')).toBe('.webm')
  })
})
