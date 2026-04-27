import { Link } from 'react-router-dom'
import { useStudySets } from '../data/store'

export function HomeRoute() {
  const { sets } = useStudySets()
  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="appTitle">English Chunk Study</div>
          <div className="appSubtitle">한글 의도 → 2~3청크 조립 시험</div>
        </div>
      </header>

      <main className="container">
        <h1 className="h1">세트 선택</h1>
        <div className="grid">
          {sets.map((s) => (
            <section key={s.id} className="card">
              <div className="cardTitle">{s.title}</div>
              <div className="muted">{s.description}</div>
              <div className="row">
                <Link className="btn" to={`/sets/${s.id}/learn`}>
                  학습
                </Link>
                <Link className="btnPrimary" to={`/sets/${s.id}/quiz`}>
                  시험
                </Link>
                <Link className="btn" to={`/sets/${s.id}/manage`}>
                  추가/관리
                </Link>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

