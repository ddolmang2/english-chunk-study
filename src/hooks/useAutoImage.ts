import { useEffect, useMemo, useState } from 'react'
import { googleImageSearchUrl, hasPixabayKey, searchImage, type ImageSearchResult } from '../services/imageSearch'

type AutoImageState =
  | { status: 'idle'; url: string | null; source: string | null; searchUrl: string }
  | { status: 'loading'; url: string | null; source: string | null; searchUrl: string }
  | { status: 'ready'; url: string; source: string; searchUrl: string }
  | { status: 'not-found'; url: null; source: null; searchUrl: string }

const CACHE_KEY = 'englishChunkStudy.imageCache.v1'

type CacheShape = Record<string, { url: string; source: string; ts: number }>

function loadCache(): CacheShape {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as CacheShape
  } catch {
    return {}
  }
}

function saveCache(cache: CacheShape) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

function removeCacheEntry(cacheId: string) {
  const cache = loadCache()
  if (!cache[cacheId]) return
  delete cache[cacheId]
  saveCache(cache)
}

export function useAutoImage(params: { cacheId: string; query: string; providedUrl?: string }) {
  const { cacheId, query, providedUrl } = params

  const searchUrl = useMemo(() => googleImageSearchUrl(query), [query])
  const [state, setState] = useState<AutoImageState>(() => ({
    status: 'idle',
    url: providedUrl ?? null,
    source: providedUrl ? 'manual' : null,
    searchUrl,
  }))

  useEffect(() => {
    if (providedUrl) {
      setState({ status: 'ready', url: providedUrl, source: 'manual', searchUrl })
      return
    }

    const q = query.trim()
    if (!q) {
      setState({ status: 'not-found', url: null, source: null, searchUrl })
      return
    }

    const cache = loadCache()
    const cached = cache[cacheId]
    if (cached?.url) {
      setState({ status: 'ready', url: cached.url, source: cached.source, searchUrl })
      return
    }

    const controller = new AbortController()
    setState((prev) => ({ ...prev, status: 'loading', searchUrl }))

    ;(async () => {
      try {
        const result: ImageSearchResult | null = await searchImage(q, controller.signal)
        if (!result) {
          setState({ status: 'not-found', url: null, source: null, searchUrl })
          return
        }
        const next = loadCache()
        next[cacheId] = { url: result.url, source: result.source, ts: Date.now() }
        saveCache(next)
        setState({ status: 'ready', url: result.url, source: result.source, searchUrl })
      } catch (e) {
        if (controller.signal.aborted) return
        setState({ status: 'not-found', url: null, source: null, searchUrl })
      }
    })()

    return () => controller.abort()
  }, [cacheId, providedUrl, query, searchUrl])

  return {
    ...state,
    hasPixabayKey,
    query,
    invalidate: () => removeCacheEntry(cacheId),
  }
}

