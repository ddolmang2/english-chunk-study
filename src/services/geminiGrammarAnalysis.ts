export type GeminiGrammarAnalysis = {
  translation: string
  grammar_analysis: {
    subject: string
    verb: string
    object: string
  }
  learning_tip: string
  _meta?: {
    usedModel?: string
    usedBaseUrl?: string
  }
}

type ResponseBody = {
  analysis?: GeminiGrammarAnalysis
  meta?: {
    usedModel?: string
    usedBaseUrl?: string
  }
  error?: string
}

export async function analyzeSentenceGrammar(sentence: string, signal?: AbortSignal): Promise<GeminiGrammarAnalysis> {
  const trimmed = sentence.trim()
  if (!trimmed) throw new Error('분석할 문장이 비어 있습니다.')

  const res = await fetch('/api/analyze-sentence-grammar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence: trimmed }),
    signal,
  })

  const json = (await res.json()) as ResponseBody
  if (!res.ok || !json.analysis) {
    throw new Error(json.error ?? '문장 분석 요청에 실패했습니다.')
  }
  return {
    ...json.analysis,
    _meta: json.meta,
  }
}
