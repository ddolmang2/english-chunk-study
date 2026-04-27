import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { chunkMap, type Chunk, type StudySet, type Template } from '../data/sample'
import { getSetById, resetToSeed, upsertSet } from '../data/store'

function normalizeId(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function splitLines(s: string) {
  return s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr))
}

export function ManageRoute() {
  const { setId } = useParams()
  const set = setId ? getSetById(setId) : null

  const chunkById = useMemo(() => (set ? chunkMap(set) : new Map()), [set])

  const [tab, setTab] = useState<'chunks' | 'templates'>('chunks')

  // Chunk form
  const [chunkEn, setChunkEn] = useState('')
  const [chunkKo, setChunkKo] = useState('')
  const [chunkExample, setChunkExample] = useState('')
  const [chunkTags, setChunkTags] = useState('place')

  // Template form
  const [tplKoPrompts, setTplKoPrompts] = useState('')
  const [tplTags, setTplTags] = useState('direction')
  const [selectedChunkIds, setSelectedChunkIds] = useState<string[]>([])

  if (!set) {
    return (
      <div className="page">
        <main className="container">
          <h1 className="h1">세트를 찾을 수 없어요</h1>
          <Link className="btn" to="/">
            홈으로
          </Link>
        </main>
      </div>
    )
  }

  const saveSet = (next: StudySet) => {
    upsertSet(next)
  }

  const addChunk = () => {
    const en = chunkEn.trim()
    if (!en) return
    const id = `c_${normalizeId(en)}`
    const koSenses = splitLines(chunkKo)
    const example = chunkExample.trim() || en
    const tags = uniq(
      chunkTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    )

    if (set.chunks.some((c) => c.id === id)) {
      alert(`이미 같은 id가 있어요: ${id}\n(영문 청크를 조금 다르게 입력해보세요)`)
      return
    }

    const nextChunk: Chunk = {
      id,
      en,
      koSenses: koSenses.length ? koSenses : ['(한글 의미를 입력하세요)'],
      example,
      tags,
    }

    saveSet({ ...set, chunks: [...set.chunks, nextChunk] })

    setChunkEn('')
    setChunkKo('')
    setChunkExample('')
  }

  const toggleSelectedChunk = (id: string) => {
    setSelectedChunkIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev // 2~3 청크 목표, 우선 3개까지만 선택
      return [...prev, id]
    })
  }

  const addTemplate = () => {
    const koPrompts = splitLines(tplKoPrompts)
    if (koPrompts.length === 0) return
    if (selectedChunkIds.length < 2) {
      alert('정답 청크는 최소 2개를 선택해줘.')
      return
    }

    const id = `t_${normalizeId(koPrompts[0])}_${Math.random().toString(16).slice(2, 8)}`
    const tags = uniq(
      tplTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    )

    const nextTpl: Template = {
      id,
      koPrompts,
      answerChunkIds: selectedChunkIds,
      tags,
    }

    saveSet({ ...set, templates: [...set.templates, nextTpl] })

    setTplKoPrompts('')
    setSelectedChunkIds([])
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link className="btnGhost" to="/">
          ← 세트
        </Link>
        <div className="topbarTitle">{set.title} · 추가/관리</div>
        <div className="row" style={{ marginTop: 0 }}>
          <Link className="btn" to={`/sets/${set.id}/learn`}>
            학습
          </Link>
          <Link className="btnPrimary" to={`/sets/${set.id}/quiz`}>
            시험
          </Link>
        </div>
      </header>

      <main className="container">
        <section className="card">
          <div className="rowBetween">
            <div>
              <div className="cardTitle">컨텐츠 추가</div>
              <div className="muted" style={{ marginTop: 6 }}>
                여기서 추가한 청크/문제는 자동으로 저장되고, 바로 시험에 반영돼요.
              </div>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!confirm('저장된 추가 컨텐츠를 모두 지우고 초기 샘플로 돌아갈까요?')) return
                resetToSeed()
                location.reload()
              }}
              title="localStorage 초기화"
            >
              초기화
            </button>
          </div>

          <div className="divider" />

          <div className="row">
            <button
              type="button"
              className={tab === 'chunks' ? 'btnPrimary' : 'btn'}
              onClick={() => setTab('chunks')}
            >
              청크 추가
            </button>
            <button
              type="button"
              className={tab === 'templates' ? 'btnPrimary' : 'btn'}
              onClick={() => setTab('templates')}
            >
              문제 추가
            </button>
          </div>
        </section>

        {tab === 'chunks' ? (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="label">영어 청크</div>
            <input
              className="input"
              value={chunkEn}
              onChange={(e) => setChunkEn(e.target.value)}
              placeholder='예: "How do I get to" / "the hospital"'
            />

            <div className="label" style={{ marginTop: 12 }}>
              한글 의미(여러 줄 가능)
            </div>
            <textarea
              className="textarea"
              value={chunkKo}
              onChange={(e) => setChunkKo(e.target.value)}
              placeholder={'예:\n~에 어떻게 가요?\n~로 가는 길'}
            />

            <div className="label" style={{ marginTop: 12 }}>
              예문(선택)
            </div>
            <input
              className="input"
              value={chunkExample}
              onChange={(e) => setChunkExample(e.target.value)}
              placeholder='예: "How do I get to the hospital?"'
            />

            <div className="label" style={{ marginTop: 12 }}>
              태그(쉼표로 구분)
            </div>
            <input
              className="input"
              value={chunkTags}
              onChange={(e) => setChunkTags(e.target.value)}
              placeholder="예: place, direction, A1"
            />

            <div className="rowBetween" style={{ marginTop: 12 }}>
              <div className="muted">저장되면 학습/시험에 바로 등장해요.</div>
              <button className="btnPrimary" type="button" onClick={addChunk}>
                청크 추가
              </button>
            </div>

            <div className="divider" />

            <div className="label">현재 청크 ({set.chunks.length})</div>
            <div className="chips" style={{ marginTop: 10 }}>
              {set.chunks.map((c) => (
                <span key={c.id} className="chip" title={(c.koSenses ?? []).join('\n')}>
                  {c.en}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="label">한글 문제(여러 줄 가능)</div>
            <textarea
              className="textarea"
              value={tplKoPrompts}
              onChange={(e) => setTplKoPrompts(e.target.value)}
              placeholder={'예:\n역에 어떻게 가요?\n역까지 어떻게 가죠?'}
            />

            <div className="label" style={{ marginTop: 12 }}>
              정답 청크 선택 (2~3개)
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              {set.chunks.map((c) => {
                const selected = selectedChunkIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={selected ? 'chip chipPicked' : 'chip chipOption'}
                    onClick={() => toggleSelectedChunk(c.id)}
                    title={(c.koSenses ?? []).join('\n')}
                  >
                    {c.en}
                  </button>
                )
              })}
            </div>
            <div className="muted" style={{ marginTop: 10 }}>
              선택됨: {selectedChunkIds.map((id) => chunkById.get(id)?.en ?? id).join(' + ') || '-'}
            </div>

            <div className="label" style={{ marginTop: 12 }}>
              태그(쉼표로 구분)
            </div>
            <input
              className="input"
              value={tplTags}
              onChange={(e) => setTplTags(e.target.value)}
              placeholder="예: direction, get-to"
            />

            <div className="rowBetween" style={{ marginTop: 12 }}>
              <div className="muted">추가하면 시험에서 랜덤으로 출제돼요.</div>
              <button className="btnPrimary" type="button" onClick={addTemplate}>
                문제 추가
              </button>
            </div>

            <div className="divider" />

            <div className="label">현재 문제 ({set.templates.length})</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {set.templates.map((t) => (
                <div key={t.id} className="panel">
                  <div className="muted" style={{ marginBottom: 6 }}>
                    {t.koPrompts[0]}
                  </div>
                  <div className="chips">
                    {t.answerChunkIds.map((id) => (
                      <span key={id} className="chip">
                        {chunkById.get(id)?.en ?? id}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

