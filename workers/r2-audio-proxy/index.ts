/**
 * Cloudflare Worker - R2 Audio Proxy
 *
 * Endpoints:
 *   PUT    /upload/{filename}                          - Single-shot upload (small files)
 *   POST   /multipart/init/{filename}                  - Start multipart upload
 *   PUT    /multipart/part/{filename}?uploadId=&partNumber= - Upload one part
 *   POST   /multipart/complete/{filename}              - Assemble parts into final file
 *   DELETE /multipart/abort/{filename}?uploadId=       - Abort and clean up
 *   DELETE /delete/{filename}                          - Delete a file
 */

export interface Env {
  AUDIO_BUCKET: R2Bucket
  ALLOWED_ORIGINS: string
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  if (!allowedOrigins.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data: unknown, status = 200, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function isValidFilename(filename: string): boolean {
  return /^[a-f0-9-]+\.(webm|mp4)$/i.test(filename)
}

function storageContentType(filename: string): string {
  return filename.toLowerCase().endsWith('.mp4') ? 'audio/mp4' : 'audio/webm'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      const corsHeaders = getCorsHeaders(request, env)
      if (!corsHeaders) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const cors = getCorsHeaders(request, env)
    if (!cors) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403 })

    const pathParts = url.pathname.split('/').filter(Boolean)

    try {
      // ── Single-shot upload: PUT /upload/{filename} ──────────────────────
      if (pathParts.length === 2 && pathParts[0] === 'upload' && request.method === 'PUT') {
        const filename = pathParts[1]
        if (!isValidFilename(filename)) return json({ error: 'Invalid filename' }, 400, cors)

        const maxBytes = 300 * 1024 * 1024
        const contentLength = parseInt(request.headers.get('Content-Length') || '0')
        if (contentLength > maxBytes) return json({ error: `Too large (max 300 MB)` }, 413, cors)

        const contentType = request.headers.get('Content-Type') || ''
        const allowed = ['audio/webm', 'audio/mp4', 'video/mp4']
        if (!allowed.some((t) => contentType.startsWith(t))) {
          return json({ error: `Invalid content type: ${contentType}` }, 400, cors)
        }

        await env.AUDIO_BUCKET.put(filename, request.body, {
          httpMetadata: { contentType: storageContentType(filename) },
        })
        return json({ success: true, filename }, 200, cors)
      }

      // ── Multipart endpoints: /multipart/{action}/{filename} ─────────────
      if (pathParts.length === 3 && pathParts[0] === 'multipart') {
        const [, action, filename] = pathParts
        if (!isValidFilename(filename)) return json({ error: 'Invalid filename' }, 400, cors)

        // Init: POST /multipart/init/{filename}
        if (action === 'init' && request.method === 'POST') {
          const mpu = await env.AUDIO_BUCKET.createMultipartUpload(filename, {
            httpMetadata: { contentType: storageContentType(filename) },
          })
          return json({ uploadId: mpu.uploadId }, 200, cors)
        }

        // Upload part: PUT /multipart/part/{filename}?uploadId=&partNumber=
        if (action === 'part' && request.method === 'PUT') {
          const uploadId = url.searchParams.get('uploadId')
          const partNumber = parseInt(url.searchParams.get('partNumber') || '0')
          if (!uploadId || !partNumber) return json({ error: 'Missing uploadId or partNumber' }, 400, cors)

          const mpu = env.AUDIO_BUCKET.resumeMultipartUpload(filename, uploadId)
          const part = await mpu.uploadPart(partNumber, request.body!)
          return json({ partNumber: part.partNumber, etag: part.etag }, 200, cors)
        }

        // Complete: POST /multipart/complete/{filename}
        if (action === 'complete' && request.method === 'POST') {
          const { uploadId, parts } = await request.json() as {
            uploadId: string
            parts: R2UploadedPart[]
          }
          const mpu = env.AUDIO_BUCKET.resumeMultipartUpload(filename, uploadId)
          await mpu.complete(parts)
          return json({ success: true, filename }, 200, cors)
        }

        // Abort: DELETE /multipart/abort/{filename}?uploadId=
        if (action === 'abort' && request.method === 'DELETE') {
          const uploadId = url.searchParams.get('uploadId')
          if (!uploadId) return json({ error: 'Missing uploadId' }, 400, cors)
          const mpu = env.AUDIO_BUCKET.resumeMultipartUpload(filename, uploadId)
          await mpu.abort()
          return json({ success: true }, 200, cors)
        }
      }

      // ── Delete: DELETE /delete/{filename} ───────────────────────────────
      if (pathParts.length === 2 && pathParts[0] === 'delete' && request.method === 'DELETE') {
        const filename = pathParts[1]
        if (!isValidFilename(filename)) return json({ error: 'Invalid filename' }, 400, cors)
        await env.AUDIO_BUCKET.delete(filename)
        return json({ success: true }, 200, cors)
      }

      return json({ error: 'Not found' }, 404, cors)
    } catch (error) {
      console.error('Worker error:', error)
      return json({ error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` }, 500, cors)
    }
  },
}
