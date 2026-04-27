import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { chunkMap } from '../data/sample'
import { getSetById } from '../data/store'
import { useAutoImage } from '../hooks/useAutoImage'

export function LearnRoute() {
  const { setId } = useParams()
  const set = setId ? getSetById(setId) : null
  const [idx, setIdx] = useState(0)
  const [showKo, setShowKo] = useState(false)

  const chunks = set?.chunks ?? []
  const current = chunks[idx] ?? null
  const chunkById = useMemo(() => (set ? chunkMap(set) : new Map()), [set])
  const autoImg = useAutoImage({
    cacheId: `${setId ?? 'set'}:${current?.id ?? 'none'}`,
    query: current?.keyword ?? current?.en ?? '',
    providedUrl: current?.imgUrl,
  })

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
        <div className="row" style={{ marginTop: 0 }}>
          <Link className="btn" to={`/sets/${set.id}/img-quiz`}>
            이미지 퀴즈
          </Link>
          <Link className="btnPrimary" to={`/sets/${set.id}/quiz`}>
            조립 시험
          </Link>
        </div>
      </header>

      <main className="container">
        <div className="card">
          <div className="rowBetween">
            <div>
              <div className="muted">
                {idx + 1} / {chunks.length}
              </div>
            </div>
            <button className="btn" type="button" onClick={() => setShowKo((v) => !v)}>
              {showKo ? '해석 숨기기' : '해석 보기'}
            </button>
          </div>

          <div className="divider" />

          <button
            type="button"
            className="imgCard"
            onClick={() => setShowKo((v) => !v)}
            title="탭하면 해석 토글"
          >
            {autoImg.status === 'ready' ? (
              <img
                className="imgMain"
                src={autoImg.url}
                alt={current?.keyword ?? current?.en ?? 'image'}
                onError={() => {
                  autoImg.invalidate()
                }}
              />
            ) : (
              <div className="imgFallback">
                <div className="imgFallbackTitle">{current?.keyword ?? 'Image'}</div>
                <div className="imgFallbackSub muted">
                  {autoImg.status === 'loading'
                    ? '이미지 검색 중...'
                    : autoImg.status === 'not-found'
                      ? '이미지를 찾지 못했어요'
                      : '이미지 없음'}
                </div>
                {!autoImg.hasPixabayKey && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Pixabay API 키가 없어요. `.env` 설정 후 개발서버를 재시작하세요.
                  </div>
                )}
                {(autoImg.status === 'not-found' || autoImg.status === 'idle') && (
                  <a className="btnLink" href={autoImg.searchUrl} target="_blank" rel="noreferrer">
                    Google 이미지 검색
                  </a>
                )}
              </div>
            )}
          </button>

          <div className="chunkEn" style={{ marginTop: 14 }}>
            {current?.en}
          </div>

          {showKo && (
            <div className="koReveal">
              {(current?.koSenses ?? []).join(' · ') || '(해석 없음)'}
            </div>
          )}

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
              onClick={() => {
                setIdx((v) => Math.min(chunks.length - 1, v + 1))
                setShowKo(false)
              }}
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

