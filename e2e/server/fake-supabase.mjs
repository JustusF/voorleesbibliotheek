// Nagebouwde Supabase voor de e2e-tests: PostgREST, Storage en de regels die
// in productie gelden (kolommen, verplichte velden, foreign keys, unieke
// sleutels en het rechtenmodel: anon mag lezen, toevoegen en bijwerken, niet
// verwijderen). Alles staat in het geheugen; er gaat niets naar het echte
// project.
//
// Sturing vanuit de tests:
//   POST /__control/reset   { seed? }      -> begintoestand
//   POST /__control/rules   [{ match, status?, delayMs?, times?, drop? }]
//   GET  /__control/state                  -> tabellen + objecten + requestlog
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const ANON_KEY = 'anon-test-key'
export const SERVICE_KEY = 'service-test-key'

// Gelijk aan het live schema (information_schema, 18-11-2026).
const SCHEMA = {
  users: {
    pk: ['id'],
    columns: {
      id: { type: 'uuid', default: () => randomUUID() },
      family_id: { type: 'text', notNull: true, default: () => '1' },
      name: { type: 'text', notNull: true },
      avatar_url: { type: 'text' },
      role: { type: 'text', notNull: true, default: () => 'reader', oneOf: ['reader', 'admin', 'listener'] },
      invite_code: { type: 'text' },
      created_at: { type: 'timestamptz', default: () => new Date().toISOString() },
    },
    fks: [],
  },
  books: {
    pk: ['id'],
    columns: {
      id: { type: 'uuid', default: () => randomUUID() },
      family_id: { type: 'text', notNull: true, default: () => '1' },
      title: { type: 'text', notNull: true },
      cover_url: { type: 'text' },
      created_at: { type: 'timestamptz', default: () => new Date().toISOString() },
      author: { type: 'text' },
      updated_at: { type: 'timestamptz', default: () => new Date().toISOString() },
    },
    fks: [],
  },
  chapters: {
    pk: ['id'],
    columns: {
      id: { type: 'uuid', default: () => randomUUID() },
      book_id: { type: 'uuid', notNull: true },
      chapter_number: { type: 'integer', notNull: true },
      title: { type: 'text', notNull: true },
      created_at: { type: 'timestamptz', default: () => new Date().toISOString() },
    },
    fks: [{ column: 'book_id', table: 'books' }],
  },
  recordings: {
    pk: ['id'],
    columns: {
      id: { type: 'uuid', default: () => randomUUID() },
      chapter_id: { type: 'uuid', notNull: true },
      reader_id: { type: 'uuid', notNull: true },
      audio_url: { type: 'text', notNull: true },
      duration_seconds: { type: 'integer', default: () => 0 },
      created_at: { type: 'timestamptz', default: () => new Date().toISOString() },
    },
    fks: [
      { column: 'chapter_id', table: 'chapters' },
      { column: 'reader_id', table: 'users' },
    ],
  },
  progress: {
    pk: ['id'],
    unique: [['chapter_id', 'listener_id']],
    columns: {
      id: { type: 'uuid', default: () => randomUUID() },
      chapter_id: { type: 'uuid', notNull: true },
      recording_id: { type: 'uuid', notNull: true },
      playback_position: { type: 'float', default: () => 0 },
      duration: { type: 'float', default: () => 0 },
      completed: { type: 'boolean', default: () => false },
      last_played: { type: 'timestamptz', default: () => new Date().toISOString() },
      listener_id: { type: 'uuid' },
    },
    fks: [
      { column: 'chapter_id', table: 'chapters' },
      { column: 'recording_id', table: 'recordings' },
    ],
  },
  recording_locks: {
    pk: ['chapter_id', 'reader_id'],
    anonMayDelete: true,
    columns: {
      chapter_id: { type: 'uuid', notNull: true },
      reader_id: { type: 'uuid', notNull: true },
      reader_name: { type: 'text', notNull: true },
      locked_at: { type: 'timestamptz', default: () => new Date().toISOString() },
      expires_at: { type: 'timestamptz', notNull: true },
    },
    fks: [
      { column: 'chapter_id', table: 'chapters' },
      { column: 'reader_id', table: 'users' },
    ],
  },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class PgError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function emptyTables() {
  return Object.fromEntries(Object.keys(SCHEMA).map((t) => [t, []]))
}

export function createFakeSupabase({ audioDir } = {}) {
  let tables = emptyTables()
  /** @type {Map<string, {body: Buffer, contentType: string}>} */
  let objects = new Map()
  let rules = []
  let log = []

  function reset(seed) {
    tables = emptyTables()
    objects = new Map()
    rules = []
    log = []
    if (seed?.tables) {
      for (const [name, rows] of Object.entries(seed.tables)) {
        tables[name] = rows.map((r) => ({ ...r }))
      }
    }
    if (seed?.objects) {
      for (const [name, file] of Object.entries(seed.objects)) {
        objects.set(name, {
          body: fs.readFileSync(file),
          contentType: name.endsWith('.mp4') ? 'audio/mp4' : name.endsWith('.wav') ? 'audio/wav' : 'audio/webm',
        })
      }
    }
  }

  function roleOf(req) {
    const auth = req.headers.authorization || ''
    const key = auth.replace(/^Bearer\s+/i, '') || req.headers.apikey
    if (key === SERVICE_KEY) return 'service_role'
    if (key === ANON_KEY) return 'anon'
    return null
  }

  function coerce(table, row, { partial }) {
    const def = SCHEMA[table]
    const out = {}
    for (const [col, value] of Object.entries(row)) {
      const c = def.columns[col]
      if (!c) {
        throw new PgError(400, 'PGRST204', `Could not find the '${col}' column of '${table}' in the schema cache`)
      }
      if (value === null || value === undefined) {
        out[col] = null
        continue
      }
      if (c.type === 'uuid' && !(typeof value === 'string' && UUID_RE.test(value))) {
        throw new PgError(400, '22P02', `invalid input syntax for type uuid: "${value}"`)
      }
      if (c.type === 'integer' && !Number.isInteger(Number(value))) {
        throw new PgError(400, '22P02', `invalid input syntax for type integer: "${value}"`)
      }
      if (c.type === 'float' && !Number.isFinite(Number(value))) {
        throw new PgError(400, '22P02', `invalid input syntax for type double precision: "${value}"`)
      }
      if (c.oneOf && !c.oneOf.includes(value)) {
        throw new PgError(400, '23514', `new row for relation "${table}" violates check constraint`)
      }
      out[col] = c.type === 'integer' || c.type === 'float' ? Number(value) : value
    }
    if (!partial) {
      for (const [col, c] of Object.entries(def.columns)) {
        if (out[col] === undefined || (out[col] === null && c.default && row[col] === undefined)) {
          out[col] = c.default ? c.default() : null
        }
      }
    }
    return out
  }

  function checkRow(table, row) {
    const def = SCHEMA[table]
    for (const [col, c] of Object.entries(def.columns)) {
      if (c.notNull && (row[col] === null || row[col] === undefined)) {
        throw new PgError(400, '23502', `null value in column "${col}" of relation "${table}" violates not-null constraint`)
      }
    }
    for (const fk of def.fks) {
      const value = row[fk.column]
      if (value === null || value === undefined) continue
      if (!tables[fk.table].some((r) => r.id === value)) {
        throw new PgError(409, '23503', `insert or update on table "${table}" violates foreign key constraint "${table}_${fk.column}_fkey"`)
      }
    }
  }

  // Postgres: NULL is nooit gelijk aan NULL, dus een unieke sleutel met een
  // lege kolom botst niet.
  function findConflict(table, row, cols, except) {
    if (cols.some((c) => row[c] === null || row[c] === undefined)) return null
    return tables[table].find((r) => r !== except && cols.every((c) => r[c] === row[c])) ?? null
  }

  function uniqueSets(table) {
    return [SCHEMA[table].pk, ...(SCHEMA[table].unique ?? [])]
  }

  function insertRows(table, rows, { upsert, onConflict }) {
    const result = []
    for (const raw of rows) {
      const row = coerce(table, raw, { partial: false })
      checkRow(table, row)
      const conflictCols = onConflict ? onConflict.split(',').map((s) => s.trim()) : SCHEMA[table].pk
      const target = upsert ? findConflict(table, row, conflictCols) : null
      if (target) {
        const patch = coerce(table, raw, { partial: true })
        const next = { ...target, ...patch }
        for (const cols of uniqueSets(table)) {
          if (findConflict(table, next, cols, target)) {
            throw new PgError(409, '23505', `duplicate key value violates unique constraint on "${table}"`)
          }
        }
        Object.assign(target, patch)
        result.push(target)
        continue
      }
      for (const cols of uniqueSets(table)) {
        if (findConflict(table, row, cols)) {
          throw new PgError(409, '23505', `duplicate key value violates unique constraint "${table}_pkey"`)
        }
      }
      tables[table].push(row)
      result.push(row)
    }
    return result
  }

  function parseFilters(params) {
    const filters = []
    for (const [key, value] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
      const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.*)$/s.exec(value)
      if (!m) throw new PgError(400, 'PGRST100', `unsupported filter ${key}=${value}`)
      filters.push({ column: key, negate: !!m[1], op: m[2], value: m[3] })
    }
    return filters
  }

  function matches(row, f) {
    const v = row[f.column]
    let ok
    switch (f.op) {
      case 'eq': ok = v !== null && v !== undefined && String(v) === f.value; break
      case 'neq': ok = v !== null && v !== undefined && String(v) !== f.value; break
      case 'gt': ok = v !== null && String(v) > f.value; break
      case 'gte': ok = v !== null && String(v) >= f.value; break
      case 'lt': ok = v !== null && String(v) < f.value; break
      case 'lte': ok = v !== null && String(v) <= f.value; break
      case 'is': ok = f.value === 'null' ? v === null || v === undefined : String(v) === f.value; break
      case 'in': ok = f.value.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v)); break
      default: ok = false
    }
    return f.negate ? !ok : ok
  }

  function cascadeDelete(table, removed) {
    for (const [child, def] of Object.entries(SCHEMA)) {
      for (const fk of def.fks) {
        if (fk.table !== table) continue
        const ids = new Set(removed.map((r) => r.id))
        const gone = tables[child].filter((r) => ids.has(r[fk.column]))
        if (gone.length === 0) continue
        tables[child] = tables[child].filter((r) => !ids.has(r[fk.column]))
        cascadeDelete(child, gone)
      }
    }
  }

  function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      ...cors,
      ...headers,
    })
    res.end(payload)
  }

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  function filePartFromMultipart(buffer, contentType) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
    if (!boundary) return null
    const delim = Buffer.from(`--${boundary[1] || boundary[2]}`)
    let pos = buffer.indexOf(delim)
    let best = null
    while (pos !== -1) {
      const next = buffer.indexOf(delim, pos + delim.length)
      if (next === -1) break
      const part = buffer.subarray(pos + delim.length + 2, next - 2)
      const headerEnd = part.indexOf('\r\n\r\n')
      if (headerEnd !== -1) {
        const head = part.subarray(0, headerEnd).toString('utf8')
        const body = part.subarray(headerEnd + 4)
        const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]
        if (/filename=/i.test(head) || (type && !best)) best = { body, contentType: type }
      }
      pos = next
    }
    return best
  }

  async function handleRest(req, res, url, role) {
    const table = url.pathname.replace('/rest/v1/', '')
    if (!SCHEMA[table]) throw new PgError(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`)
    const prefer = String(req.headers.prefer || '')
    const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object')
    const wantsRows = prefer.includes('return=representation')
    const filters = parseFilters(url.searchParams)

    const respond = (rows, status = 200) => {
      if (req.method !== 'GET' && !wantsRows) return send(res, status === 200 ? 204 : status)
      if (wantsObject) {
        if (rows.length !== 1) {
          throw new PgError(406, 'PGRST116', `JSON object requested, multiple (or no) rows returned`)
        }
        return send(res, status, rows[0])
      }
      return send(res, status, rows, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      let rows = tables[table].filter((r) => filters.every((f) => matches(r, f)))
      const order = url.searchParams.get('order')
      if (order) {
        const [col, dir] = order.split('.')
        rows = [...rows].sort((a, b) => {
          const x = a[col], y = b[col]
          const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))
          return dir === 'desc' ? -cmp : cmp
        })
      }
      const limit = url.searchParams.get('limit')
      if (limit) rows = rows.slice(0, Number(limit))
      return respond(rows)
    }

    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || 'null')
      const rows = Array.isArray(body) ? body : [body]
      const upsert = prefer.includes('resolution=merge-duplicates')
      const inserted = insertRows(table, rows, { upsert, onConflict: url.searchParams.get('on_conflict') })
      return respond(inserted, 201)
    }

    if (req.method === 'PATCH') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
      const patch = coerce(table, body, { partial: true })
      const targets = tables[table].filter((r) => filters.every((f) => matches(r, f)))
      for (const row of targets) {
        const next = { ...row, ...patch }
        checkRow(table, next)
        Object.assign(row, patch)
      }
      return respond(targets)
    }

    if (req.method === 'DELETE') {
      // RLS: zonder verwijderpolicy ziet anon geen rijen om te verwijderen.
      // Geen fout, gewoon nul rijen: precies wat productie doet.
      if (role !== 'service_role' && !SCHEMA[table].anonMayDelete) return respond([])
      const gone = tables[table].filter((r) => filters.every((f) => matches(r, f)))
      tables[table] = tables[table].filter((r) => !gone.includes(r))
      cascadeDelete(table, gone)
      return respond(gone)
    }

    throw new PgError(405, 'PGRST000', 'method not allowed')
  }

  async function handleStorage(req, res, url, role) {
    const p = decodeURIComponent(url.pathname)
    const publicMatch = /^\/storage\/v1\/object\/public\/audio\/(.+)$/.exec(p)
    if (publicMatch && (req.method === 'GET' || req.method === 'HEAD')) {
      const obj = objects.get(publicMatch[1])
      if (!obj) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      const total = obj.body.length
      const range = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range || ''))
      const base = { 'Content-Type': obj.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]))
        const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1
        res.writeHead(206, { ...cors, ...base, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 })
        return res.end(req.method === 'HEAD' ? undefined : obj.body.subarray(start, end + 1))
      }
      res.writeHead(200, { ...cors, ...base, 'Content-Length': total })
      return res.end(req.method === 'HEAD' ? undefined : obj.body)
    }

    const objectMatch = /^\/storage\/v1\/object\/audio\/(.+)$/.exec(p)
    if (objectMatch && (req.method === 'POST' || req.method === 'PUT')) {
      const name = objectMatch[1]
      const raw = await readBody(req)
      const type = String(req.headers['content-type'] || '')
      const part = type.includes('multipart/form-data')
        ? filePartFromMultipart(raw, type)
        : { body: raw, contentType: type }
      if (!part || part.body.length === 0) {
        return send(res, 400, { statusCode: '400', error: 'invalid_request', message: 'empty body' })
      }
      const upsert = String(req.headers['x-upsert'] || '') === 'true' || req.method === 'PUT'
      if (objects.has(name) && !upsert) {
        return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
      }
      objects.set(name, { body: part.body, contentType: part.contentType || 'application/octet-stream' })
      if (audioDir) {
        fs.mkdirSync(audioDir, { recursive: true })
        fs.writeFileSync(path.join(audioDir, name.replace(/[^a-zA-Z0-9._-]/g, '_')), part.body)
      }
      return send(res, 200, { Id: randomUUID(), Key: `audio/${name}` })
    }

    if (p === '/storage/v1/object/audio' && req.method === 'DELETE') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
      if (role !== 'service_role') return send(res, 200, [])
      const gone = []
      for (const name of body.prefixes || []) {
        if (objects.delete(name)) gone.push({ name })
      }
      return send(res, 200, gone)
    }

    return send(res, 404, { statusCode: '404', error: 'not_found', message: `no storage route for ${req.method} ${p}` })
  }

  function ruleKey(req, url) {
    if (url.pathname.startsWith('/rest/v1/')) return `rest:${url.pathname.replace('/rest/v1/', '')}:${req.method}`
    if (url.pathname.startsWith('/storage/v1/object/public/')) return `storage:download`
    if (url.pathname.startsWith('/storage/v1/')) return `storage:${req.method === 'DELETE' ? 'delete' : 'upload'}`
    return `other:${url.pathname}`
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake')
    try {
      if (req.method === 'OPTIONS') return send(res, 204)

      if (url.pathname === '/__control/reset' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        reset(body.seed)
        return send(res, 200, { ok: true })
      }
      if (url.pathname === '/__control/rules' && req.method === 'POST') {
        rules = JSON.parse((await readBody(req)).toString('utf8') || '[]')
        return send(res, 200, { ok: true })
      }
      if (url.pathname === '/__control/state') {
        return send(res, 200, {
          tables,
          objects: [...objects].map(([name, o]) => ({ name, size: o.body.length, contentType: o.contentType })),
          log,
        })
      }

      const key = ruleKey(req, url)
      log.push({ key, at: Date.now(), query: url.search })
      const rule = rules.find((r) => key.startsWith(r.match) && (r.times === undefined || r.times > 0))
      if (rule) {
        if (rule.times !== undefined) rule.times--
        if (rule.delayMs) await new Promise((r) => setTimeout(r, rule.delayMs))
        if (rule.drop) return req.socket.destroy()
        if (rule.status) {
          req.resume()
          return send(res, rule.status, { message: `ingespoten fout ${rule.status}`, code: 'TEST', error: 'TEST', statusCode: String(rule.status) })
        }
      }

      const role = roleOf(req)
      if (url.pathname.startsWith('/storage/v1/object/public/')) return await handleStorage(req, res, url, role)
      if (!role) return send(res, 401, { message: 'Invalid API key' })
      if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url, role)
      if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url, role)
      return send(res, 404, { message: `no route for ${url.pathname}` })
    } catch (error) {
      if (error instanceof PgError) {
        return send(res, error.status, { code: error.code, message: error.message, details: null, hint: null })
      }
      console.error('[fake-supabase]', error)
      return send(res, 500, { message: String(error) })
    }
  })

  // Realtime staat in productie niet aan (geen tabellen in de publicatie).
  // Verbinding weigeren is dus het eerlijkste gedrag.
  server.on('upgrade', (_req, socket) => socket.destroy())

  return { server, reset }
}
