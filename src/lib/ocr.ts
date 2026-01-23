// OCR service using Claude Vision API via Vercel serverless function
// The API key is stored securely on the server as ANTHROPIC_API_KEY environment variable

interface ExtractedChapter {
  number: number
  title: string
}

export interface OCRResult {
  success: boolean
  chapters: ExtractedChapter[]
  error?: string
}

/**
 * Convert a File or Blob to base64 data URL
 */
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Extract the base64 part (remove data:image/...;base64, prefix)
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Get the media type from a File
 */
function getMediaType(file: File): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const type = file.type.toLowerCase()
  if (type === 'image/png') return 'image/png'
  if (type === 'image/gif') return 'image/gif'
  if (type === 'image/webp') return 'image/webp'
  return 'image/jpeg' // Default to jpeg
}

/**
 * Extract chapter titles from one or more images of a table of contents
 * using Claude Vision API via serverless function
 */
export async function extractChaptersFromImages(images: File[]): Promise<OCRResult> {
  if (images.length === 0) {
    return {
      success: false,
      chapters: [],
      error: 'Geen afbeeldingen geselecteerd.',
    }
  }

  try {
    // Convert all images to base64
    const imageContents = await Promise.all(
      images.map(async (image) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: getMediaType(image),
          data: await fileToBase64(image),
        },
      }))
    )

    // Call the serverless function
    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images: imageContents,
      }),
    })

    const result: OCRResult = await response.json()
    return result
  } catch (error) {
    console.error('OCR error:', error)
    return {
      success: false,
      chapters: [],
      error: `Er ging iets mis: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    }
  }
}
