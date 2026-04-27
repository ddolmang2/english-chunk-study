## English Chunk Study (Web MVP)

한글 의도(문제)를 보고 **2~3개 청크를 클릭해서** 영어 문장을 조립하는 웹 앱 MVP입니다.

### 실행

```bash
npm install
npm run dev
```

> PowerShell에서 `npm` 실행이 막히면 `npm.cmd`로 실행하세요:
>
> ```bash
> npm.cmd install
> npm.cmd run dev
> ```

### 구성

- `src/data/sample.ts`: 세트/청크/문제(템플릿) 데이터
- `src/data/store.ts`: localStorage 저장/로드 (웹에서 추가한 컨텐츠가 여기에 저장됨)
- `src/routes/HomeRoute.tsx`: 세트 선택
- `src/routes/LearnRoute.tsx`: 청크 카드 학습
- `src/routes/QuizRoute.tsx`: 조립 퀴즈(한글 → 청크 클릭 → 제출)
- `src/routes/ManageRoute.tsx`: 컨텐츠 추가/관리(청크 추가, 문제 추가)

### 콘텐츠 추가 방법

- **웹에서 추가**: 홈에서 세트 카드의 `추가/관리`로 들어가서 청크/문제를 추가
- **코드로 추가**: `src/data/sample.ts`의 `studySets`에 seed 데이터로 추가

