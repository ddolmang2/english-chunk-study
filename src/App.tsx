import { Navigate, Route, Routes } from 'react-router-dom'
import { HomeRoute } from './routes/HomeRoute'
import { LearnRoute } from './routes/LearnRoute'
import { ImgQuizRoute } from './routes/ImgQuizRoute'
import { BulkImportRoute } from './routes/BulkImportRoute'
import { ManageRoute } from './routes/ManageRoute'
import { QuizRoute } from './routes/QuizRoute'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/bulk-import" element={<BulkImportRoute />} />
      <Route path="/sets/:setId/learn" element={<LearnRoute />} />
      <Route path="/sets/:setId/quiz" element={<QuizRoute />} />
      <Route path="/sets/:setId/img-quiz" element={<ImgQuizRoute />} />
      <Route path="/sets/:setId/manage" element={<ManageRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

