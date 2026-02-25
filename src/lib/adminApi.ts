/**
 * Admin API client — routes write mutations through the Vercel API route.
 * The API route (api/admin-mutations.ts) uses SUPABASE_SERVICE_KEY which bypasses RLS.
 *
 * VITE_ADMIN_SECRET must be set in .env for admin operations to work.
 * The same value must be set as ADMIN_SECRET in Vercel environment variables.
 */

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET as string | undefined

export const isAdminConfigured = !!ADMIN_SECRET

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_SECRET ?? ''}`,
  }
}

async function adminMutation(
  operation: 'insert' | 'upsert' | 'update' | 'delete' | 'insertMany' | 'upsertMany' | 'deleteWhere',
  table: string,
  options: {
    data?: Record<string, unknown> | Record<string, unknown>[]
    id?: string
    field?: string
    value?: string
  } = {}
): Promise<unknown> {
  if (!ADMIN_SECRET) {
    throw new Error('VITE_ADMIN_SECRET not configured — admin operations unavailable')
  }

  const res = await fetch('/api/admin-mutations', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ operation, table, ...options }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `Admin mutation failed: ${res.status}`)
  }

  const result = await res.json() as { data: unknown }
  return result.data
}

export const adminApi = {
  insert: (table: string, data: Record<string, unknown>) =>
    adminMutation('insert', table, { data }),

  upsert: (table: string, data: Record<string, unknown>) =>
    adminMutation('upsert', table, { data }),

  insertMany: (table: string, data: Record<string, unknown>[]) =>
    adminMutation('insertMany', table, { data }),

  upsertMany: (table: string, data: Record<string, unknown>[]) =>
    adminMutation('upsertMany', table, { data }),

  update: (table: string, id: string, data: Record<string, unknown>) =>
    adminMutation('update', table, { data, id }),

  delete: (table: string, id: string) =>
    adminMutation('delete', table, { id }),

  deleteWhere: (table: string, field: string, value: string) =>
    adminMutation('deleteWhere', table, { field, value }),
}
