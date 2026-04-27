import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { chunkMap, type Chunk, type Template } from '../data/sample'
import { getSetById } from '../data/store'

function pickOne<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function idsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function sentenceFromChunks(chunks: Chunk[]) {
  const raw = chunks.map((c) => c.en.trim()).join(' ')
  return raw.replace(/\s+\?/g, '?')
}

type QuizRound = {
  template: Template
  koPrompt: string
  answerIds: string[]
  optionIds: string[]
}

export function QuizRoute() {
  const { setId } = useParams()
  const set = setId ? getSetById(setId) : null

  const chunkById = useMemo(() => (set ? chunkMap(set) : new Map()), [set])

  const buildRound = useCallback((): QuizRound | null => {
    if (!set) return null
    const template = pickOne(set.templates)
    const koPrompt = pickOne(template.koPrompts)
    const answerIds = template.answerChunkIds

    // Options = correct chunks + distractors (same set, not already included)
    const distractorPool = set.chunks
      .filter((c) => !answerIds.includes(c.id))
      .map((c) => c.id)
    const distractors = shuffle(distractorPool).slice(0, Math.max(3, 6 - answerIds.length))

    const optionIds = shuffle([...answerIds, ...distractors])
    return { template, koPrompt, answerIds, optionIds }
  }, [set])

  const [round, setRound] = useState<QuizRound | null>(() => buildRound())
  const [picked, setPicked] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const resetRound = useCallback(() => {
    setRound(buildRound())
    setPicked([])
    setSubmitted(false)
  }, [buildRound])

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

  if (!round) {
    return (
      <div className="page">
        <main className="container">
          <h1 className="h1">문제를 만들 수 없어요</h1>
          <Link className="btn" to="/">
            홈으로
          </Link>
        </main>
      </div>
    )
  }

  const answerChunks = round.answerIds.map((id) => chunkById.get(id)).filter(Boolean) as Chunk[]
  const correctSentence = sentenceFromChunks(answerChunks) + '?'
  const canPickMore = picked.length < round.answerIds.length && !submitted
  const isCorrect = submitted && idsEqual(picked, round.answerIds)

  return (
    <div className="page">
      <header className="topbar">
        <Link className="btnGhost" to="/">
          ← 세트
        </Link>
        <div className="topbarTitle">{set.title} · 시험</div>
        <Link className="btn" to={`/sets/${set.id}/learn`}>
          학습
        </Link>
      </header>

      <main className="container">
        <section className="card">
          <div className="label">문제 (한글)</div>
          <div className="koPrompt">{round.koPrompt}</div>

          <div className="divider" />

          <div className="label">내가 고른 청크 ({picked.length} / {round.answerIds.length})</div>
          <div className="chips" style={{ marginTop: 10 }}>
            {picked.length === 0 ? (
              <span className="muted">아래 청크를 눌러 문장을 조립해요.</span>
            ) : (
              picked.map((id, i) => (
                <button
                  key={`${id}-${i}`}
                  type="button"
                  className="chip chipPicked"
                  onClick={() => {
                    if (submitted) return
                    setPicked((prev) => prev.filter((_, idx) => idx !== i))
                  }}
                  title="클릭하면 제거"
                >
                  {chunkById.get(id)?.en ?? id}
                </button>
              ))
            )}
          </div>

          <div className="rowBetween" style={{ marginTop: 14 }}>
            <button
              className="btn"
              type="button"
              onClick={() => setPicked((prev) => prev.slice(0, -1))}
              disabled={picked.length === 0 || submitted}
            >
              마지막 삭제
            </button>
            {!submitted ? (
              <button
                className="btnPrimary"
                type="button"
                onClick={() => setSubmitted(true)}
                disabled={picked.length !== round.answerIds.length}
              >
                제출
              </button>
            ) : (
              <button className="btnPrimary" type="button" onClick={resetRound}>
                다음 문제
              </button>
            )}
          </div>

          {submitted && (
            <div className={`result ${isCorrect ? 'ok' : 'no'}`}>
              <div className="resultTitle">{isCorrect ? '정답!' : '오답'}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                정답: <span className="mono">{correctSentence}</span>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="label">청크 보기</div>
          <div className="chips" style={{ marginTop: 10 }}>
            {round.optionIds.map((id) => {
              const chunk = chunkById.get(id)
              const disabled = !canPickMore || picked.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  className="chip chipOption"
                  disabled={disabled}
                  onClick={() => {
                    if (!canPickMore) return
                    setPicked((prev) => [...prev, id])
                  }}
                  title={chunk?.koSenses?.[0] ?? ''}
                >
                  {chunk?.en ?? id}
                </button>
              )
            })}
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            팁: 위의 “내가 고른 청크”에서 청크를 클릭하면 중간 것도 제거할 수 있어요.
          </div>
        </section>
      </main>
    </div>
  )
}

