export type SentenceAnalysis = {
  language: string
  tone: string
  summary: string
  grammarTips: string[]
  keywords: string[]
  _meta?: {
    usedModel?: string
    usedBaseUrl?: string
  }
}

type AnalyzeSentenceResponse = {
  analysis?: SentenceAnalysis
  meta?: {
    usedModel?: string
    usedBaseUrl?: string
  }
  error?: string
}

export async function analyzeSentenceWithGemini(
  sentence: string,
  signal?: AbortSignal,
): Promise<SentenceAnalysis> {
  const trimmed = sentence.trim()
  if (!trimmed) {
    throw new Error('분석할 문장을 입력해 주세요.')
  }

  const res = await fetch('/api/analyze-sentence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sentence: trimmed }),
    signal,
  })

  const json = (await res.json()) as AnalyzeSentenceResponse
  if (!res.ok || !json.analysis) {
    throw new Error(json.error ?? '문장 분석에 실패했습니다.')
  }

  return {
    ...json.analysis,
    _meta: json.meta,
  }
}
