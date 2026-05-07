/**
 * Vercel serverless function for admin database mutations.
 * Uses SUPABASE_SERVICE_KEY (bypasses RLS) — requires a server-side admin
 * session cookie created by api/admin-session.ts.
 * Called by src/lib/adminApi.ts from the React frontend.
 *
 * Env vars required (Vercel):
 *   ADMIN_SECRET        — random server-only secret for signing session cookies
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key (never expose to browser)
 */
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

type Operation = 'insert' | 'upsert' | 'update' | 'delete' | 'insertMany' | 'upsertMany' | 'deleteWhere'

interface MutationRequest {
  operation: Operation
  table: string
  data?: Record<string, unknown> | Record<string, unknown>[]
  id?: string
  field?: string  // for deleteWhere
  value?: string  // for deleteWhere
  onConflict?: string
}

// Only allow mutations on these tables
const ALLOWED_TABLES = ['users', 'books', 'chapters', 'recordings', 'progress']
const COOKIE_NAME = 'voorleesbibliotheek_admin_session'

interface NodeLikeRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined> | Headers
  body?: unknown
}

type RuntimeRequest = Request | NodeLikeRequest

interface NodeLikeResponse {
  statusCode?: number
  setHeader?: (name: string, value: string | string[]) => void
  status?: (statusCode: number) => NodeLikeResponse
  json?: (body: unknown) => void
  end?: (body?: string) => void
}

function jsonResponse(
  res: NodeLikeResponse | undefined,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response | void {
  if (!res) {
    return Response.json(body, init)
  }

  const statusCode = init.status ?? 200
  if (init.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      res.setHeader?.(key, value)
    }
  }

  res.setHeader?.('Content-Type', 'application/json')
  if (res.status) {
    res.status(statusCode)
  } else {
    res.statusCode = statusCode
  }

  if (res.json) {
    res.json(body)
  } else {
    res.end?.(JSON.stringify(body))
  }
}

function getHeader(req: RuntimeRequest, name: string): string | null {
  const headers = req.headers
  if (!headers) return null

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)
  }

  const value = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()]
  if (Array.isArray(value)) return value.join(', ')
  return value ?? null
}

async function readJson(req: RuntimeRequest): Promise<unknown> {
  if (typeof (req as Request).json === 'function') {
    return (req as Request).json()
  }

  if ('body' in req && req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  }

  return {}
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function timingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf)
}

function sign(value: string, secret: string): string {
  return base64Url(createHmac('sha256', secret).update(value).digest())
}

function getCookie(req: RuntimeRequest, name: string): string | null {
  const cookieHeader = getHeader(req, 'Cookie')
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map((part) => part.trim())
  const match = cookies.find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function isValidAdminSession(req: RuntimeRequest, adminSecret: string): boolean {
  const token = getCookie(req, COOKIE_NAME)
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature || !timingEqual(sign(payload, adminSecret), signature)) {
    return false
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(normalized, 'base64').toString('utf8')
    const session = JSON.parse(json) as { exp?: number }
    return typeof session.exp === 'number' && session.exp > Date.now()
  } catch {
    return false
  }
}

function resolveOnConflict(table: string, requested?: string): string | undefined {
  if (requested) return requested
  if (table === 'progress') return 'chapter_id,listener_id'
  return undefined
}

function resolveUpsertOptions(table: string, requested?: string): { onConflict: string } | undefined {
  const onConflict = resolveOnConflict(table, requested)
  return onConflict ? { onConflict } : undefined
}

export default async function handler(req: RuntimeRequest, res?: NodeLikeResponse): Promise<Response | void> {
  if (req.method !== 'POST') {
    return jsonResponse(res, { error: 'Method not allowed' }, { status: 405 })
  }

  // Verify admin secret
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    console.error('[admin-mutations] ADMIN_SECRET not configured')
    return jsonResponse(res, { error: 'Server misconfigured' }, { status: 500 })
  }

  if (!isValidAdminSession(req, adminSecret)) {
    return jsonResponse(res, { error: 'Unauthorized' }, { status: 401 })
  }

  // Create Supabase admin client (service key bypasses RLS)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[admin-mutations] Supabase env vars not configured')
    return jsonResponse(res, { error: 'Server misconfigured' }, { status: 500 })
  }

  const db = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await readJson(req) as MutationRequest
    const { operation, table, data, id, field, value, onConflict } = body

    // Validate table
    if (!ALLOWED_TABLES.includes(table)) {
      return jsonResponse(res, { error: 'Invalid table' }, { status: 400 })
    }

    let result: { data?: unknown; error?: { message: string } | null }

    switch (operation) {
      case 'insert':
        result = await db.from(table).insert(data as Record<string, unknown>).select().single()
        break

      case 'upsert':
        result = await db.from(table)
          .upsert(data as Record<string, unknown>, resolveUpsertOptions(table, onConflict))
          .select()
          .single()
        break

      case 'insertMany':
        result = await db.from(table).insert(data as Record<string, unknown>[]).select()
        break

      case 'upsertMany':
        result = await db.from(table)
          .upsert(data as Record<string, unknown>[], { onConflict: resolveOnConflict(table, onConflict) || 'id' })
          .select()
        break

      case 'update':
        if (!id) return jsonResponse(res, { error: 'id required for update' }, { status: 400 })
        result = await db.from(table).update(data as Record<string, unknown>).eq('id', id).select().single()
        break

      case 'delete':
        if (!id) return jsonResponse(res, { error: 'id required for delete' }, { status: 400 })
        result = await db.from(table).delete().eq('id', id)
        break

      case 'deleteWhere':
        if (!field || value === undefined) {
          return jsonResponse(res, { error: 'field and value required for deleteWhere' }, { status: 400 })
        }
        result = await db.from(table).delete().eq(field, value)
        break

      default:
        return jsonResponse(res, { error: 'Invalid operation' }, { status: 400 })
    }

    if (result.error) {
      console.error(`[admin-mutations] ${operation} on ${table}:`, result.error.message)
      return jsonResponse(res, { error: 'Database error' }, { status: 500 })
    }

    return jsonResponse(res, { data: result.data ?? null })
  } catch (error) {
    console.error('[admin-mutations] error:', error)
    return jsonResponse(res, { error: 'Internal server error' }, { status: 500 })
  }
}
