import { useEffect, useMemo, useState } from 'react'
import { studySets as seedSets, type StudySet } from './sample'

const STORAGE_KEY = 'englishChunkStudy.sets.v1'

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadSets(): StudySet[] {
  if (typeof window === 'undefined') return seedSets
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return seedSets
  const parsed = safeJsonParse<StudySet[]>(raw)
  return Array.isArray(parsed) ? parsed : seedSets
}

export function saveSets(sets: StudySet[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
}

export function upsertSet(nextSet: StudySet) {
  const sets = loadSets()
  const idx = sets.findIndex((s) => s.id === nextSet.id)
  const next = idx === -1 ? [...sets, nextSet] : sets.map((s) => (s.id === nextSet.id ? nextSet : s))
  saveSets(next)
  window.dispatchEvent(new Event('englishChunkStudy:setsChanged'))
}

export function useStudySets() {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1)
    window.addEventListener('storage', onChange)
    window.addEventListener('englishChunkStudy:setsChanged', onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('englishChunkStudy:setsChanged', onChange)
    }
  }, [])

  const sets = useMemo(() => loadSets(), [version])
  return { sets }
}

export function getSetById(setId: string) {
  return loadSets().find((s) => s.id === setId) ?? null
}

export function resetToSeed() {
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event('englishChunkStudy:setsChanged'))
}

