/**
 * Cloudflare Worker - R2 Audio Proxy
 *
 * This worker acts as a secure proxy between the frontend app and R2 storage.
 * It handles CORS, validates requests, and provides upload/delete operations.
 *
 * Endpoints:
 * - PUT /upload/{filename} - Upload audio file to R2
 * - DELETE /delete/{filename} - Delete audio file from R2
 * - OPTIONS /* - Handle CORS preflight
 */

export interface Env {
  AUDIO_BUCKET: R2Bucket // R2 bucket binding
  ALLOWED_ORIGINS: string // Comma-separated list of allowed origins
}

// Helper to get CORS headers
function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())

  // Check if the origin is allowed
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', // 24 hours
  }
}

// Validate filename
function isValidFilename(filename: string): boolean {
  // Allow .webm (Android/desktop) and .mp4 (iOS) with UUID-like names
  const pattern = /^[a-f0-9-]+\.(webm|mp4)$/i
  return pattern.test(filename)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const corsHeaders = getCorsHeaders(request, env)

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    const path = url.pathname
    const pathParts = path.split('/').filter(Boolean)

    // Validate path structure
    if (pathParts.length !== 2) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [action, filename] = pathParts

    // Validate filename
    if (!isValidFilename(filename)) {
      return new Response(JSON.stringify({ error: 'Invalid filename format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    try {
      // Handle upload
      if (request.method === 'PUT' && action === 'upload') {
        const contentType = request.headers.get('Content-Type') || ''

        // Allow audio/webm (Android/desktop) and audio/mp4 (iOS)
        const allowedTypes = ['audio/webm', 'audio/mp4', 'video/mp4']
        if (!allowedTypes.some((t) => contentType.startsWith(t))) {
          return new Response(JSON.stringify({ error: `Invalid content type: ${contentType}. Expected audio/webm or audio/mp4` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Check Content-Length before reading body (saves bandwidth on oversized files)
        const maxSize = 300 * 1024 * 1024 // 300MB — ~5 hours at 128kbps
        const contentLength = parseInt(request.headers.get('Content-Length') || '0')
        if (contentLength > maxSize) {
          return new Response(JSON.stringify({ error: `File too large (${Math.round(contentLength / 1024 / 1024)}MB). Maximum 300MB.` }), {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Stream request body directly to R2 — avoids buffering entire file in Worker memory
        const storageContentType = contentType.startsWith('audio/mp4') || contentType.startsWith('video/mp4')
          ? 'audio/mp4'
          : 'audio/webm'
        await env.AUDIO_BUCKET.put(filename, request.body, {
          httpMetadata: {
            contentType: storageContentType,
          },
        })

        return new Response(
          JSON.stringify({
            success: true,
            filename,
            message: 'Audio uploaded successfully',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Handle delete
      if (request.method === 'DELETE' && action === 'delete') {
        // Check if file exists first
        const existingObject = await env.AUDIO_BUCKET.head(filename)

        if (!existingObject) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'File does not exist (already deleted)',
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }

        // Delete from R2
        await env.AUDIO_BUCKET.delete(filename)

        return new Response(
          JSON.stringify({
            success: true,
            filename,
            message: 'Audio deleted successfully',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Unknown action/method combination
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Worker error:', error)

      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  },
}
