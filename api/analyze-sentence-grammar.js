import { getCoachGuidelineLines } from './coach-guideline'

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
    ...getCoachGuidelineLines(),
    'Analyze the sentence and return only valid JSON with this exact schema:',
    '{',
    '  "translation": "string",',
    '  "grammar_analysis": {',
    '    "subject": "string",',
    '    "verb": "string",',
    '    "object": "string"',
    '  },',
    '  "learning_tip": "string"',
    '}',
    'Rules:',
    '- Use natural Korean paraphrase for translation.',
    '- If object does not exist, return empty string.',
    '- Do not include markdown or extra text.',
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
  if (!sentence) return res.status(400).json({ error: 'sentence is required.' })
  if (sentence.length > 1200) return res.status(400).json({ error: 'sentence is too long.' })

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
      const parsed = JSON.parse(cleaned)
      return res.status(200).json({ analysis: parsed })
    }
    return res.status(500).json({ error: `No available Groq model: ${lastError}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Groq request failed.'
    return res.status(500).json({ error: message })
  }
}
