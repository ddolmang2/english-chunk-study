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
          <Link className="btn" to="/cloze-workbook">
            PDF학습
          </Link>
          <Link className="btn" to="/bulk-import">
            학습데이터관리
          </Link>
        </div>
      </header>

      <main className="container">
        <h1 className="h1">세트 선택</h1>
        <div className="grid">
          {sets.map((s) => (
            <section key={s.id} className="card">
              <div className="row">
                <Link className="btn" to={`/sets/${s.id}/learn`}>
                  학습
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

