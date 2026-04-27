import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { chunkMap, type Chunk } from '../data/sample'
import { getSetById } from '../data/store'
import { useAutoImage } from '../hooks/useAutoImage'

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

type ImgRound = {
  targetChunkId: string
  optionChunkIds: string[]
}

export function ImgQuizRoute() {
  const { setId } = useParams()
  const set = setId ? getSetById(setId) : null
  const chunkById = useMemo(() => (set ? chunkMap(set) : new Map()), [set])

  const eligibleChunks = useMemo(() => {
    const chunks = set?.chunks ?? []
    // Allow img-less chunks too (keyword fallback), but prefer those with image.
    const withVisual = chunks.filter((c) => Boolean(c.imgUrl) || Boolean(c.keyword))
    return withVisual.length ? withVisual : chunks
  }, [set])

  const buildRound = useCallback((): ImgRound | null => {
    if (!set) return null
    if (eligibleChunks.length < 2) return null
    const target = pickOne(eligibleChunks)

    const distractorPool = eligibleChunks.filter((c) => c.id !== target.id)
    const options = shuffle(distractorPool)
      .slice(0, 3)
      .map((c) => c.id)
    const optionChunkIds = shuffle([target.id, ...options]).slice(0, 4)
    return { targetChunkId: target.id, optionChunkIds }
  }, [eligibleChunks, set])

  const [round, setRound] = useState<ImgRound | null>(() => buildRound())
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle')

  const next = useCallback(() => {
    setRound(buildRound())
    setSelected(null)
    setStatus('idle')
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
          <h1 className="h1">이미지 퀴즈를 만들 수 없어요</h1>
          <div className="muted" style={{ marginTop: 8 }}>
            이 세트에 청크가 너무 적어요. (최소 2개 필요)
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Link className="btn" to={`/sets/${set.id}/manage`}>
              컨텐츠 추가
            </Link>
            <Link className="btn" to="/">
              홈으로
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const target = chunkById.get(round.targetChunkId) as Chunk | undefined
  const autoImg = useAutoImage({
    cacheId: `${setId ?? 'set'}:${target?.id ?? 'none'}:imgquiz`,
    query: target?.keyword ?? target?.en ?? '',
    providedUrl: target?.imgUrl,
  })
  const wrongPulse = status === 'wrong'

  const onPick = (chunkId: string) => {
    if (!target) return
    if (status === 'correct') return
    setSelected(chunkId)
    if (chunkId === target.id) {
      setStatus('correct')
      window.setTimeout(next, 550)
    } else {
      setStatus('wrong')
      window.setTimeout(() => setStatus('idle'), 650)
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link className="btnGhost" to="/">
          ← 세트
        </Link>
        <div className="topbarTitle">{set.title} · 이미지 퀴즈</div>
        <div className="row" style={{ marginTop: 0 }}>
          <Link className="btn" to={`/sets/${set.id}/learn`}>
            학습
          </Link>
          <Link className="btn" to={`/sets/${set.id}/manage`}>
            추가/관리
          </Link>
        </div>
      </header>

      <main className="container">
        <section className={`card ${wrongPulse ? 'cardWrong' : ''}`}>
          <div className="label">이미지 보고 정답 청크 고르기</div>
          <div className="muted" style={{ marginTop: 6 }}>
            한글 없이 이미지(또는 키워드)에 맞는 영어 청크를 선택하세요.
          </div>

          <div className="divider" />

          <div className="imgCard" style={{ cursor: 'default' }}>
            {autoImg.status === 'ready' ? (
              <img
                className="imgMain"
                src={autoImg.url}
                alt={target?.keyword ?? target?.en ?? 'image'}
                onError={() => {
                  autoImg.invalidate()
                }}
              />
            ) : (
              <div className="imgFallback">
                <div className="imgFallbackTitle">{target?.keyword ?? 'Image'}</div>
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
          </div>

          <div className="divider" />

          <div className="chips" style={{ marginTop: 10 }}>
            {round.optionChunkIds.map((id) => {
              const c = chunkById.get(id)
              const isChosen = selected === id
              return (
                <button
                  key={id}
                  className={`chip chipOption ${isChosen ? 'chipChosen' : ''}`}
                  type="button"
                  onClick={() => onPick(id)}
                >
                  {c?.en ?? id}
                </button>
              )
            })}
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            {status === 'wrong' ? '틀렸어요. 다시 골라봐요.' : status === 'correct' ? '정답!' : ' '}
          </div>
        </section>
      </main>
    </div>
  )
}

