const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
const MODEL_CANDIDATES = [
  process.env.GROQ_MODEL,
  process.env.GROK_MODEL, // backward-compat
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
].filter(Boolean)

function buildPrompt(sentence) {
  return [
    "너는 한국인 학습자를 위한 '20년 경력의 베테랑 영어 코치'야.",
    '사용자가 입력한 영어 문장을 분석할 때, 다음의 3단계 보안 가이드라인을 반드시 준수해.',
    '',
    '1. [Chunking]: 문장을 의미 단위(Chunk)로 슬래시(/)를 써서 정확히 쪼갤 것.',
    '   (예: I went / to the store / to buy some milk.)',
    "2. [Interpretation]: 한국어 뉘앙스를 100% 살린 자연스러운 의역을 제공할 것.",
    "   직역보다는 사모님이 이해하기 쉬운 '생활 밀착형' 번역을 선호함.",
    '3. [Grammar Analysis]: 하이라이트된 부분의 문법적 구조를 16년 차 전문가가 보고서 쓰듯',
    '   명확하고 간결하게 설명할 것. 불필요한 전문 용어는 피하고 핵심만 짚어줘.',
    '',
    '위의 내용을 항상 적용시켜줘.',
    '',
    'Analyze the user sentence and return only valid JSON with this exact shape:',
    '{',
    '  "language": "string",',
    '  "tone": "string",',
    '  "summary": "string",',
    '  "grammarTips": ["string"],',
    '  "keywords": ["string"]',
    '}',
    'Do not add markdown fences or extra text.',
    `Sentence: "${sentence}"`,
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY ||
    process.env.GROK_API_KEY || // backward-compat
    process.env.NEXT_PUBLIC_GROK_API_KEY || // backward-compat
    process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API key is not configured.' })
  }

  const sentence = typeof req.body?.sentence === 'string' ? req.body.sentence.trim() : ''
  if (!sentence) {
    return res.status(400).json({ error: 'sentence is required.' })
  }
  if (sentence.length > 1200) {
    return res.status(400).json({ error: 'sentence is too long.' })
  }

  try {
    let lastError = 'Unknown Groq error'
    for (const model of MODEL_CANDIDATES) {
      const bodyWithJsonFormat = {
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: buildPrompt(sentence) },
        ],
      }

      const bodyWithoutJsonFormat = {
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: buildPrompt(sentence) },
        ],
      }

      let response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyWithJsonFormat),
      })

      if (!response.ok) {
        const errText = await response.text()
        lastError = `model=${model}, status=${response.status}, body=${errText}`
        if (response.status === 400 && errText.includes('Model not found')) continue

        // Some Groq configurations may reject `response_format`. Retry without it.
        const shouldRetryWithoutJsonFormat =
          response.status === 400 && /response_format|json_object|unsupported/i.test(errText)
        if (shouldRetryWithoutJsonFormat) {
          response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyWithoutJsonFormat),
          })
          if (!response.ok) {
            const retryErrText = await response.text()
            return res
              .status(500)
              .json({ error: `Groq request failed: model=${model}, status=${response.status}, body=${retryErrText}` })
          }
        } else {
          return res.status(500).json({ error: `Groq request failed: ${lastError}` })
        }
      }

      const json = await response.json()
      const content = json?.choices?.[0]?.message?.content?.trim?.() ?? ''
      if (!content) return res.status(502).json({ error: 'Empty response from Groq.' })
      const cleaned = content.startsWith('```')
        ? content.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```$/m, '').trim()
        : content
      const analysis = JSON.parse(cleaned)
      return res.status(200).json({ analysis })
    }
    return res.status(500).json({ error: `No available Groq model: ${lastError}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Groq request failed.'
    return res.status(500).json({ error: message })
  }
}
