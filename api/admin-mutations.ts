/**
 * Vercel serverless function for admin database mutations.
 * Uses SUPABASE_SERVICE_KEY (bypasses RLS) — requires ADMIN_SECRET auth.
 * Called by src/lib/adminApi.ts from the React frontend.
 *
 * Env vars required (Vercel):
 *   ADMIN_SECRET        — random secret shared with VITE_ADMIN_SECRET in the frontend
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key (never expose to browser)
 */
import { createClient } from '@supabase/supabase-js'

type Operation = 'insert' | 'upsert' | 'update' | 'delete' | 'insertMany' | 'upsertMany' | 'deleteWhere'

interface MutationRequest {
  operation: Operation
  table: string
  data?: Record<string, unknown> | Record<string, unknown>[]
  id?: string
  field?: string  // for deleteWhere
  value?: string  // for deleteWhere
}

// Only allow mutations on these tables
const ALLOWED_TABLES = ['users', 'books', 'chapters', 'recordings']

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  // Verify admin secret
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    console.error('[admin-mutations] ADMIN_SECRET not configured')
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create Supabase admin client (service key bypasses RLS)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[admin-mutations] Supabase env vars not configured')
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const db = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json() as MutationRequest
    const { operation, table, data, id, field, value } = body

    // Validate table
    if (!ALLOWED_TABLES.includes(table)) {
      return Response.json({ error: 'Invalid table' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: { data?: unknown; error?: { message: string } | null }

    switch (operation) {
      case 'insert':
        result = await db.from(table).insert(data as Record<string, unknown>).select().single()
        break

      case 'upsert':
        result = await db.from(table).upsert(data as Record<string, unknown>).select().single()
        break

      case 'insertMany':
        result = await db.from(table).insert(data as Record<string, unknown>[]).select()
        break

      case 'upsertMany':
        result = await db.from(table).upsert(data as Record<string, unknown>[], { onConflict: 'id' }).select()
        break

      case 'update':
        if (!id) return Response.json({ error: 'id required for update' }, { status: 400 })
        result = await db.from(table).update(data as Record<string, unknown>).eq('id', id).select().single()
        break

      case 'delete':
        if (!id) return Response.json({ error: 'id required for delete' }, { status: 400 })
        result = await db.from(table).delete().eq('id', id)
        break

      case 'deleteWhere':
        if (!field || value === undefined) {
          return Response.json({ error: 'field and value required for deleteWhere' }, { status: 400 })
        }
        result = await db.from(table).delete().eq(field, value)
        break

      default:
        return Response.json({ error: 'Invalid operation' }, { status: 400 })
    }

    if (result.error) {
      console.error(`[admin-mutations] ${operation} on ${table}:`, result.error.message)
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    return Response.json({ data: result.data ?? null })
  } catch (error) {
    console.error('[admin-mutations] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
