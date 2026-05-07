/**
 * Admin API client — routes privileged mutations through Vercel API routes.
 * The browser never receives ADMIN_SECRET. A successful PIN login creates an
 * HttpOnly server session cookie that /api/admin-mutations validates.
 */

const ADMIN_SERVER_SESSION_KEY = 'voorleesbibliotheek_admin_server_session'

export function hasAdminSession(): boolean {
  return typeof sessionStorage !== 'undefined' &&
    sessionStorage.getItem(ADMIN_SERVER_SESSION_KEY) === 'true'
}

export interface AdminSessionResult {
  success: boolean
  serverSession: boolean
  code?: string
  message?: string
}

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  }
}

export async function startAdminSession(pin: string): Promise<AdminSessionResult> {
  try {
    const res = await fetch('/api/admin-session', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ pin }),
    })

    const body = await res.json().catch(() => ({})) as {
      success?: boolean
      code?: string
      error?: string
    }

    if (res.ok && body.success) {
      sessionStorage.setItem(ADMIN_SERVER_SESSION_KEY, 'true')
      return { success: true, serverSession: true }
    }

    sessionStorage.removeItem(ADMIN_SERVER_SESSION_KEY)
    return {
      success: false,
      serverSession: false,
      code: body.code || `HTTP_${res.status}`,
      message: body.error || 'Admin sessie kon niet worden gestart',
    }
  } catch {
    // Local Vite dev usually has no Vercel API route. Keep local admin usable,
    // but privileged sync will remain disabled because no server session exists.
    sessionStorage.removeItem(ADMIN_SERVER_SESSION_KEY)
    return {
      success: false,
      serverSession: false,
      code: 'ADMIN_AUTH_UNAVAILABLE',
      message: 'Admin sessie route is niet bereikbaar',
    }
  }
}

export async function endAdminSession(): Promise<void> {
  sessionStorage.removeItem(ADMIN_SERVER_SESSION_KEY)
  await fetch('/api/admin-session', { method: 'DELETE' }).catch(() => {})
}

async function adminMutation(
  operation: 'insert' | 'upsert' | 'update' | 'delete' | 'insertMany' | 'upsertMany' | 'deleteWhere',
  table: string,
  options: {
    data?: Record<string, unknown> | Record<string, unknown>[]
    id?: string
    field?: string
    value?: string
    onConflict?: string
  } = {}
): Promise<unknown> {
  if (!hasAdminSession()) {
    throw new Error('Admin sessie ontbreekt — log eerst in via Beheer')
  }

  const res = await fetch('/api/admin-mutations', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ operation, table, ...options }),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem(ADMIN_SERVER_SESSION_KEY)
    }
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `Admin mutation failed: ${res.status}`)
  }

  const result = await res.json() as { data: unknown }
  return result.data
}

export const adminApi = {
  insert: (table: string, data: Record<string, unknown>) =>
    adminMutation('insert', table, { data }),

  upsert: (table: string, data: Record<string, unknown>, onConflict?: string) =>
    adminMutation('upsert', table, { data, onConflict }),

  insertMany: (table: string, data: Record<string, unknown>[]) =>
    adminMutation('insertMany', table, { data }),

  upsertMany: (table: string, data: Record<string, unknown>[], onConflict?: string) =>
    adminMutation('upsertMany', table, { data, onConflict }),

  update: (table: string, id: string, data: Record<string, unknown>) =>
    adminMutation('update', table, { data, id }),

  delete: (table: string, id: string) =>
    adminMutation('delete', table, { id }),

  deleteWhere: (table: string, field: string, value: string) =>
    adminMutation('deleteWhere', table, { field, value }),
}
