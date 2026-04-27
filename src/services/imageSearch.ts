export type ImageSearchResult = {
  url: string
  source: 'pixabay-api'
  pageUrl?: string
}

const PIXABAY_API_KEY = import.meta.env.VITE_PIXABAY_API_KEY as string | undefined
export const hasPixabayKey = Boolean(PIXABAY_API_KEY)

export async function searchImage(query: string, signal?: AbortSignal): Promise<ImageSearchResult | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  if (!PIXABAY_API_KEY) return null

  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', PIXABAY_API_KEY)
  url.searchParams.set('q', trimmed)
  url.searchParams.set('image_type', 'photo')
  url.searchParams.set('orientation', 'horizontal')
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', '3')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return null
  const json = (await res.json()) as unknown as {
    hits?: Array<{ largeImageURL?: string; webformatURL?: string; pageURL?: string }>
  }
  const hit = json.hits?.[0]
  const img = hit?.largeImageURL ?? hit?.webformatURL
  if (!img) return null
  return { url: img, source: 'pixabay-api', pageUrl: hit?.pageURL }
}

export function googleImageSearchUrl(query: string) {
  const q = encodeURIComponent(query.trim())
  return `https://www.google.com/search?tbm=isch&q=${q}`
}

