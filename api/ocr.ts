// Vercel serverless function for OCR using Claude Vision API
// The API key is stored securely as ANTHROPIC_API_KEY environment variable in Vercel

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow larger payloads for images
    },
  },
}

interface ImageContent {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }
}

interface RequestBody {
  images: ImageContent[]
}

export default async function handler(req: Request): Promise<Response> {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        chapters: [],
        error: 'ANTHROPIC_API_KEY is niet geconfigureerd op de server.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    const body: RequestBody = await req.json()

    if (!body.images || body.images.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          chapters: [],
          error: 'Geen afbeeldingen ontvangen.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Build the message content with all images and the prompt
    const content = [
      ...body.images,
      {
        type: 'text' as const,
        text: `Analyseer deze foto('s) van een inhoudsopgave van een boek.

Extraheer alle hoofdstukken met hun nummer en titel. Let op:
- Negeer voorwoord, inleiding, bijlagen, register, etc. - alleen echte hoofdstukken
- Als er geen nummers staan, nummer ze dan zelf (1, 2, 3, ...)
- Corrigeer eventuele OCR-fouten in de titels
- Bij meerdere foto's: combineer de hoofdstukken in de juiste volgorde

Geef je antwoord als JSON array in dit formaat, ZONDER markdown code blocks:
[{"number": 1, "title": "Titel van hoofdstuk 1"}, {"number": 2, "title": "Titel van hoofdstuk 2"}]

Geef ALLEEN de JSON array terug, geen andere tekst.`,
      },
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Anthropic API error:', errorData)
      return new Response(
        JSON.stringify({
          success: false,
          chapters: [],
          error: `API fout: ${errorData.error?.message || response.statusText}`,
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const data = await response.json()
    const textContent = data.content?.find((c: { type: string }) => c.type === 'text')?.text

    if (!textContent) {
      return new Response(
        JSON.stringify({
          success: false,
          chapters: [],
          error: 'Geen tekst in API response.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse the JSON response
    try {
      // Remove potential markdown code blocks
      let jsonStr = textContent.trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7)
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3)
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3)
      }
      jsonStr = jsonStr.trim()

      const chapters = JSON.parse(jsonStr)

      if (!Array.isArray(chapters)) {
        throw new Error('Response is not an array')
      }

      // Validate and clean up chapters
      const validChapters = chapters
        .filter((ch: { title?: string }) => ch && typeof ch.title === 'string' && ch.title.trim())
        .map((ch: { number?: number; title: string }, index: number) => ({
          number: typeof ch.number === 'number' ? ch.number : index + 1,
          title: ch.title.trim(),
        }))
        .sort((a: { number: number }, b: { number: number }) => a.number - b.number)

      return new Response(
        JSON.stringify({
          success: true,
          chapters: validChapters,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (parseError) {
      console.error('Failed to parse Claude response:', textContent, parseError)
      return new Response(
        JSON.stringify({
          success: false,
          chapters: [],
          error: 'Kon de hoofdstukken niet uit de afbeelding halen. Probeer een duidelijkere foto.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error) {
    console.error('OCR error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        chapters: [],
        error: `Er ging iets mis: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
