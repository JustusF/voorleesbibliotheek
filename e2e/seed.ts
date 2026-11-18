import { SEED_WEBM, SEED_LONG_WEBM, SUPABASE_URL } from './server/ports.mjs'

// Verzonnen familie; zelfde vorm als productie, geen echte gegevens.
export const ids = {
  tantanne: '00000000-0000-0000-0000-000000000001',
  bomma: '00000000-0000-0000-0000-000000000002',
  papa: '00000000-0000-0000-0000-000000000006',
  magali: 'c0000000-0000-4000-8000-000000000001',
  kikker: 'b0000000-0000-4000-8000-000000000001',
  minoes: 'b0000000-0000-4000-8000-000000000002',
  kikker1: 'a0000000-0000-4000-8000-000000000001',
  kikker2: 'a0000000-0000-4000-8000-000000000002',
  kikker3: 'a0000000-0000-4000-8000-000000000003',
  kikker4: 'a0000000-0000-4000-8000-000000000004',
  minoes1: 'a0000000-0000-4000-8000-000000000011',
  minoes2: 'a0000000-0000-4000-8000-000000000012',
  recKikker1: 'e0000000-0000-4000-8000-000000000001',
  recKikker2: 'e0000000-0000-4000-8000-000000000002',
}

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000+00:00`

export const audioUrl = (name: string) => `${SUPABASE_URL}/storage/v1/object/public/audio/${name}`

function user(id: string, name: string, role: string) {
  return { id, family_id: '1', name, avatar_url: null, role, invite_code: null, created_at: at(1) }
}

function chapter(id: string, book_id: string, chapter_number: number, title: string) {
  return { id, book_id, chapter_number, title, created_at: at(2) }
}

export function baseSeed() {
  return {
    tables: {
      users: [
        user(ids.tantanne, 'Tantanne', 'reader'),
        user(ids.bomma, 'Bomma', 'reader'),
        user(ids.papa, 'Papa', 'admin'),
        user(ids.magali, 'Magali', 'listener'),
      ],
      books: [
        { id: ids.kikker, family_id: '1', title: 'Kikker is Kikker', author: 'Max Velthuijs', cover_url: null, created_at: at(2), updated_at: at(2) },
        { id: ids.minoes, family_id: '1', title: 'Minoes', author: 'Annie M.G. Schmidt', cover_url: null, created_at: at(3), updated_at: at(3) },
      ],
      chapters: [
        chapter(ids.kikker1, ids.kikker, 1, 'Kikker en de vreemdeling'),
        chapter(ids.kikker2, ids.kikker, 2, 'Kikker is bang'),
        chapter(ids.kikker3, ids.kikker, 3, 'Hoofdstuk 3'),
        chapter(ids.kikker4, ids.kikker, 4, 'Kikker in de kou'),
        chapter(ids.minoes1, ids.minoes, 1, 'De poes die juffrouw werd'),
        chapter(ids.minoes2, ids.minoes, 2, 'Een zwerfkat'),
      ],
      recordings: [
        { id: ids.recKikker1, chapter_id: ids.kikker1, reader_id: ids.tantanne, audio_url: audioUrl(`${ids.recKikker1}.webm`), duration_seconds: 68, created_at: at(5) },
        { id: ids.recKikker2, chapter_id: ids.kikker2, reader_id: ids.bomma, audio_url: audioUrl(`${ids.recKikker2}.webm`), duration_seconds: 8, created_at: at(6) },
      ],
      progress: [],
      recording_locks: [],
    },
    objects: {
      [`${ids.recKikker1}.webm`]: SEED_LONG_WEBM,
      [`${ids.recKikker2}.webm`]: SEED_WEBM,
    },
  }
}
