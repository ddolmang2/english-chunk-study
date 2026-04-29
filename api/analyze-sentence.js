import { getCoachGuidelineLines } from './coach-guideline'

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  process.env.NEXT_PUBLIC_GEMINI_MODEL,
  'gemini-2.5-flash',
].filter(Boolean)

function buildPrompt(sentence) {
  return [
    ...getCoachGuidelineLines(),
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
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured.' })
  }

  const sentence = typeof req.body?.sentence === 'string' ? req.body.sentence.trim() : ''
  if (!sentence) {
    return res.status(400).json({ error: 'sentence is required.' })
  }
  if (sentence.length > 1200) {
    return res.status(400).json({ error: 'sentence is too long.' })
  }

  try {
    let lastError = 'Unknown Gemini error'
    for (const model of MODEL_CANDIDATES) {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: buildPrompt(sentence) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }

      const response = await fetch(`${GEMINI_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errText = await response.text()
        lastError = `model=${model}, status=${response.status}, body=${errText}`
        if (response.status === 404 || (response.status === 400 && /not found|not supported/i.test(errText))) continue
        return res.status(500).json({ error: `Gemini request failed: ${lastError}` })
      }

      const json = await response.json()
      const content = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() ?? ''
      if (!content) return res.status(502).json({ error: 'Empty response from Gemini.' })
      const cleaned = content.startsWith('```')
        ? content.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```$/m, '').trim()
        : content
      const analysis = JSON.parse(cleaned)
      return res.status(200).json({
        analysis,
        meta: {
          usedModel: model,
          usedBaseUrl: GEMINI_BASE_URL,
        },
      })
    }
    return res.status(500).json({ error: `No available Gemini model: ${lastError}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed.'
    return res.status(500).json({ error: message })
  }
}
