import { Link } from 'react-router-dom'
import { useStudySets } from '../data/store'

export function HomeRoute() {
  const { sets } = useStudySets()
  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="appTitle">말랑한 영어공부</div>
        </div>
        <div className="row">
          <Link className="btn" to="/bulk-import">
            문장학습 데이터 추가
          </Link>
        </div>
      </header>

      <main className="container">
        <h1 className="h1">학습 선택</h1>
        <section className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <Link className="btn" to="/cloze-workbook">
              PDF학습
            </Link>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            PDF를 업로드하면 나의 자료를 학습 자료로 활용 가능해요.
          </div>
        </section>
        <div className="grid">
          {sets.map((s) => (
            <section key={s.id} className="card">
              <div className="row">
                <Link className="btn" to={`/sets/${s.id}/learn`}>
                  문장학습
                </Link>
                <Link className="btn" to={`/sets/${s.id}/img-quiz`}>
                  이미지 퀴즈
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

