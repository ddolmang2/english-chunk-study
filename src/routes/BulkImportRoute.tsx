import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Chunk, StudySet } from '../data/sample'
import { loadSets, upsertSet } from '../data/store'
import JSON5 from 'json5'

type ImportItem = {
  chunk?: string
  en?: string
  meaning?: string
  ko?: string
  keyword?: string
  imgUrl?: string
  tags?: string[] | string
}

function normalizeId(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function parseTags(tags: ImportItem['tags']): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean)
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function stripCodeFences(raw: string) {
  const trimmed = raw.trim()
  // ```json ... ```
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```$/m, '').trim()
  }
  return raw
}

function normalizeQuotes(raw: string) {
  // Convert “ ” ‘ ’ to normal quotes so JSON5 can handle better.
  return raw
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replaceAll('’', "'")
    .replaceAll('‘', "'")
}

function extractLikelyArray(raw: string) {
  const s = raw.trim()
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) return s.slice(start, end + 1)
  return raw
}

function wrapIfLooksLikeObjectsList(raw: string) {
  const s = raw.trim()
  // If user pasted: {..}, {..}  (without surrounding [])
  if (s.startsWith('{') && s.includes('},{') && !s.startsWith('[')) return `[${s}]`
  return raw
}

function insertMissingCommasBetweenObjects(raw: string) {
  // Common paste: `}{` or `}\n{` without comma
  // Turn into `},{` so it becomes a valid array.
  return raw.replace(/}\s*{/g, '},{')
}

function removeLeadingAssignment(raw: string) {
  // Common paste: `const data = [...]` or `data = [...]`
  const s = raw.trim()
  const idx = s.indexOf('[')
  if (idx === -1) return raw
  // If there's an '=' before the '[' in the same line, strip everything before '['
  const before = s.slice(0, idx)
  if (before.includes('=')) return s.slice(idx)
  return raw
}

function autoFixRawInput(raw: string) {
  let fixed = raw
  fixed = stripCodeFences(fixed)
  fixed = normalizeQuotes(fixed)
  fixed = removeLeadingAssignment(fixed)
  fixed = wrapIfLooksLikeObjectsList(fixed)
  fixed = extractLikelyArray(fixed)
  fixed = insertMissingCommasBetweenObjects(fixed)
  return fixed.trim()
}

function safeJsonParseLenient(raw: string): unknown {
  const cleaned = autoFixRawInput(raw)
  return JSON5.parse(cleaned)
}

function toKoSenses(item: ImportItem): string[] {
  const ko = (item.meaning ?? item.ko ?? '').trim()
  return ko ? [ko] : []
}

function toEn(item: ImportItem): string {
  return (item.chunk ?? item.en ?? '').trim()
}

function mergeChunks(params: {
  set: StudySet
  items: ImportItem[]
  overwriteDuplicates: boolean
}) {
  const { set, items, overwriteDuplicates } = params
  const existingById = new Map(set.chunks.map((c) => [c.id, c] as const))
  const existingByEn = new Map(set.chunks.map((c) => [c.en.trim().toLowerCase(), c] as const))

  let added = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  const nextChunks = [...set.chunks]

  for (const item of items) {
    const en = toEn(item)
    if (!en) {
      skipped++
      continue
    }
    const id = `c_${normalizeId(en)}`
    const koSenses = toKoSenses(item)
    const keyword = item.keyword?.trim() || undefined
    const imgUrl = item.imgUrl?.trim() || undefined
    const tags = parseTags(item.tags)

    const existing = existingById.get(id) ?? existingByEn.get(en.toLowerCase()) ?? null
    if (existing) {
      if (!overwriteDuplicates) {
        skipped++
        continue
      }
      const merged: Chunk = {
        ...existing,
        id: existing.id, // keep original id
        en,
        keyword: keyword ?? existing.keyword,
        imgUrl: imgUrl ?? existing.imgUrl,
        koSenses: koSenses.length ? koSenses : existing.koSenses,
        tags: tags.length ? Array.from(new Set([...(existing.tags ?? []), ...tags])) : existing.tags,
        example: existing.example || en,
      }
      const idx = nextChunks.findIndex((c) => c.id === existing.id)
      if (idx >= 0) nextChunks[idx] = merged
      updated++
      existingById.set(existing.id, merged)
      existingByEn.set(en.toLowerCase(), merged)
      continue
    }

    const next: Chunk = {
      id,
      en,
      keyword,
      imgUrl,
      koSenses: koSenses.length ? koSenses : [],
      example: en,
      tags: tags.length ? tags : [],
    }

    nextChunks.push(next)
    added++
    existingById.set(id, next)
    existingByEn.set(en.toLowerCase(), next)
  }

  return {
    nextSet: { ...set, chunks: nextChunks },
    stats: { added, updated, skipped },
    errors,
  }
}

const SAMPLE_JSON = `[
  { "chunk": "the station", "meaning": "역", "keyword": "Station", "tags": ["place"] },
  { "chunk": "the hospital", "meaning": "병원", "keyword": "Hospital", "tags": "place, direction" },
  { "chunk": "How do I get to", "meaning": "~에 어떻게 가요?", "keyword": "Ask directions", "tags": ["frame"] }
]`

export function BulkImportRoute() {
  const sets = useMemo(() => loadSets(), [])
  const [setId, setSetId] = useState<string>(sets[0]?.id ?? '')
  const [raw, setRaw] = useState(SAMPLE_JSON)
  const [overwrite, setOverwrite] = useState(true)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const currentSet = sets.find((s) => s.id === setId) ?? null

  const apply = () => {
    setResult(null)
    if (!currentSet) {
      setResult({ ok: false, msg: '세트를 선택해주세요.' })
      return
    }

    const fixed = autoFixRawInput(raw)
    if (fixed !== raw.trim()) {
      // Apply auto-fix back to textarea so user sees what changed.
      setRaw(fixed)
    }

    let parsed: unknown
    try {
      parsed = safeJsonParseLenient(fixed)
    } catch (e) {
      setResult({
        ok: false,
        msg: '파싱 실패: 자동 수정 후에도 해석할 수 없어요. (중괄호/대괄호 짝, 콤마, 따옴표를 확인해주세요)',
      })
      return
    }

    if (!Array.isArray(parsed)) {
      setResult({ ok: false, msg: '형식 오류: 최상위는 배열(Array)이어야 해요.' })
      return
    }

    const items = parsed as ImportItem[]
    const { nextSet, stats } = mergeChunks({ set: currentSet, items, overwriteDuplicates: overwrite })

    upsertSet(nextSet)
    setResult({
      ok: true,
      msg: `적용 완료: 추가 ${stats.added}개 / 덮어씀 ${stats.updated}개 / 스킵 ${stats.skipped}개`,
    })
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link className="btnGhost" to="/">
          ← 홈
        </Link>
        <div className="topbarTitle">데이터 관리 · Bulk Import</div>
        <div />
      </header>

      <main className="container">
        <section className="card">
          <div className="rowBetween">
            <div>
              <div className="cardTitle">JSON 일괄 입력</div>
              <div className="muted" style={{ marginTop: 6 }}>
                외부 AI로 만든 데이터를 한 번에 붙여넣고 “데이터 적용하기”를 누르세요. (청크만 추가/병합)
              </div>
            </div>
          </div>

          <div className="divider" />

          <div className="row" style={{ marginTop: 0, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <div className="label">대상 세트</div>
              <select className="input" value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <label className="muted" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              중복 청크는 덮어쓰기(Overwrite)
            </label>
          </div>
        </section>

        <div className="grid" style={{ marginTop: 12 }}>
          <section className="card">
            <div className="label">JSON 붙여넣기</div>
            <textarea className="textarea textareaBig" value={raw} onChange={(e) => setRaw(e.target.value)} />
            <div className="rowBetween" style={{ marginTop: 12 }}>
              <div className="muted">
                적용 후 이미지는 “학습/이미지 퀴즈”에서 필요한 순간에 자동 검색됩니다(Lazy).
              </div>
              <button className="btnPrimary" type="button" onClick={apply}>
                데이터 적용하기
              </button>
            </div>

            {result && (
              <div className={`result ${result.ok ? 'ok' : 'no'}`}>
                <div className="resultTitle">{result.ok ? '성공' : '실패'}</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {result.msg}
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="label">입력 형식 예시</div>
            <div className="muted" style={{ marginTop: 8 }}>
              최소 필드: <span className="mono">chunk</span> (또는 <span className="mono">en</span>)
            </div>
            <pre className="codeBlock" style={{ marginTop: 12 }}>
              {SAMPLE_JSON}
            </pre>
            <div className="divider" />
            <div className="label">지원 필드</div>
            <ul className="list">
              <li>
                <span className="mono">chunk</span> / <span className="mono">en</span>: 영어 청크
              </li>
              <li>
                <span className="mono">meaning</span> / <span className="mono">ko</span>: (선택) 한글 의미 (기본 숨김)
              </li>
              <li>
                <span className="mono">keyword</span>: 이미지 검색 키워드(권장)
              </li>
              <li>
                <span className="mono">imgUrl</span>: 직접 지정(선택)
              </li>
              <li>
                <span className="mono">tags</span>: 배열 또는 문자열("place, direction")
              </li>
            </ul>

            <div className="row" style={{ marginTop: 14 }}>
              {currentSet ? (
                <>
                  <Link className="btn" to={`/sets/${currentSet.id}/learn`}>
                    학습으로
                  </Link>
                  <Link className="btn" to={`/sets/${currentSet.id}/img-quiz`}>
                    이미지 퀴즈
                  </Link>
                  <Link className="btn" to={`/sets/${currentSet.id}/manage`}>
                    추가/관리
                  </Link>
                </>
              ) : (
                <Link className="btn" to="/">
                  홈으로
                </Link>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

