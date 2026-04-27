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
- `src/routes/ImgQuizRoute.tsx`: 이미지 퀴즈(이미지 → 정답 청크 선택, 한글 없음)

### 콘텐츠 추가 방법

- **웹에서 추가**: 홈에서 세트 카드의 `추가/관리`로 들어가서 청크/문제를 추가
- **코드로 추가**: `src/data/sample.ts`의 `studySets`에 seed 데이터로 추가

### 대량 데이터(외부 JSON) 추천

기본 seed는 `public/data/seed.json`을 먼저 시도해서 로드하고, 없으면 코드에 있는 seed로 fallback 합니다.

- seed 파일 위치: `public/data/seed.json`
- 로딩 코드: `src/data/store.ts`의 `SEED_URL`

### 이미지 자동 검색(Pixabay)

`imgUrl`이 비어 있는 청크는 **현재 학습 중인 카드/문제에서만** 자동으로 이미지를 검색해서 보여줍니다(지연 로딩 + 캐시).

- 설정(필수): `.env`에 `VITE_PIXABAY_API_KEY` 추가
- 예시: `.env.example` 참고
- 키가 없으면 이미지 검색을 하지 않고, Google 이미지 검색 버튼만 제공합니다.

