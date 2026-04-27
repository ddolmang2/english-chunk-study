export type Chunk = {
  id: string
  en: string
  imgUrl?: string
  keyword?: string
  koSenses: string[]
  example: string
  tags: string[]
}

export type Template = {
  id: string
  imgUrl?: string
  keyword?: string
  koPrompts: string[]
  answerChunkIds: string[] // length 2~3
  tags: string[]
}

export type StudySet = {
  id: string
  title: string
  description: string
  chunks: Chunk[]
  templates: Template[]
}

export const studySets: StudySet[] = [
  {
    id: 'directions-basic',
    title: '길 묻기 (기본)',
    description: '2청크로 문장 조립: 질문틀 + 장소',
    chunks: [
      {
        id: 'c_how_do_i_get_to',
        en: 'How do I get to',
        keyword: 'Ask directions',
        koSenses: ['~에 어떻게 가요? (길 묻기)'],
        example: 'How do I get to the station?',
        tags: ['frame', 'direction', 'A1'],
      },
      {
        id: 'c_where_is',
        en: 'Where is',
        keyword: 'Ask location',
        koSenses: ['~는 어디에 있어요? (위치 묻기)'],
        example: 'Where is the school?',
        tags: ['frame', 'direction', 'A1'],
      },
      {
        id: 'c_the_station',
        en: 'the station',
        keyword: 'Station',
        koSenses: ['역'],
        example: 'How do I get to the station?',
        tags: ['place', 'direction', 'A1'],
      },
      {
        id: 'c_the_school',
        en: 'the school',
        keyword: 'School',
        koSenses: ['학교'],
        example: 'Where is the school?',
        tags: ['place', 'direction', 'A1'],
      },
      {
        id: 'c_the_bank',
        en: 'the bank',
        keyword: 'Bank',
        koSenses: ['은행'],
        example: 'How do I get to the bank?',
        tags: ['place', 'direction', 'A1'],
      },
      {
        id: 'c_the_bathroom',
        en: 'the bathroom',
        keyword: 'Bathroom',
        koSenses: ['화장실'],
        example: 'Where is the bathroom?',
        tags: ['place', 'direction', 'A1'],
      },
    ],
    templates: [
      {
        id: 't_get_to_station',
        keyword: 'Station',
        koPrompts: ['역에 어떻게 가요?', '역까지 어떻게 가죠?'],
        answerChunkIds: ['c_how_do_i_get_to', 'c_the_station'],
        tags: ['direction', 'get-to'],
      },
      {
        id: 't_get_to_bank',
        keyword: 'Bank',
        koPrompts: ['은행에 어떻게 가요?', '은행까지 어떻게 가죠?'],
        answerChunkIds: ['c_how_do_i_get_to', 'c_the_bank'],
        tags: ['direction', 'get-to'],
      },
      {
        id: 't_where_school',
        keyword: 'School',
        koPrompts: ['학교가 어디에 있어요?', '학교는 어디에 있죠?'],
        answerChunkIds: ['c_where_is', 'c_the_school'],
        tags: ['direction', 'where-is'],
      },
      {
        id: 't_where_bathroom',
        keyword: 'Bathroom',
        koPrompts: ['화장실이 어디에 있어요?', '화장실은 어디에 있죠?'],
        answerChunkIds: ['c_where_is', 'c_the_bathroom'],
        tags: ['direction', 'where-is'],
      },
    ],
  },
]

export function chunkMap(set: StudySet) {
  return new Map(set.chunks.map((c) => [c.id, c] as const))
}

