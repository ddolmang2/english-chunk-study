import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { chunkMap } from '../data/sample'
import { getSetById } from '../data/store'

export function LearnRoute() {
  const { setId } = useParams()
  const set = setId ? getSetById(setId) : null
  const [idx, setIdx] = useState(0)

  const chunks = set?.chunks ?? []
  const current = chunks[idx] ?? null
  const chunkById = useMemo(() => (set ? chunkMap(set) : new Map()), [set])

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

  return (
    <div className="page">
      <header className="topbar">
        <Link className="btnGhost" to="/">
          ← 세트
        </Link>
        <div className="topbarTitle">{set.title} · 학습</div>
        <Link className="btnPrimary" to={`/sets/${set.id}/quiz`}>
          시험하기
        </Link>
      </header>

      <main className="container">
        <div className="card">
          <div className="rowBetween">
            <div>
              <div className="muted">
                {idx + 1} / {chunks.length}
              </div>
              <div className="chunkEn">{current?.en}</div>
            </div>
          </div>

          <div className="divider" />

          <div className="section">
            <div className="label">한글 의미(의도)</div>
            <ul className="list">
              {(current?.koSenses ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="section">
            <div className="label">예문</div>
            <div className="example">{current?.example}</div>
          </div>

          <div className="divider" />

          <div className="rowBetween">
            <button
              className="btn"
              type="button"
              onClick={() => setIdx((v) => Math.max(0, v - 1))}
              disabled={idx === 0}
            >
              이전
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setIdx((v) => Math.min(chunks.length - 1, v + 1))}
              disabled={idx >= chunks.length - 1}
            >
              다음
            </button>
          </div>
        </div>

        <div className="card">
          <div className="label">이 세트의 문제 예시</div>
          <div className="muted" style={{ marginTop: 6 }}>
            시험 화면에서 한글 문제를 보고 아래처럼 2청크를 조립해요.
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {(set.templates[0]?.answerChunkIds ?? []).map((id) => (
              <span key={id} className="chip">
                {chunkById.get(id)?.en ?? id}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

