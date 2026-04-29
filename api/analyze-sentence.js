const XAI_BASE_URL = process.env.XAI_BASE_URL || 'https://api.x.ai/v1'
const MODEL_CANDIDATES = [process.env.GROK_MODEL, 'grok-3-mini', 'grok-3', 'grok-4-0709', 'grok-code-fast-1'].filter(
  Boolean,
)

function buildPrompt(sentence) {
  return [
    'You are an English sentence analysis assistant.',
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

  const apiKey = process.env.GROK_API_KEY || process.env.NEXT_PUBLIC_GROK_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Grok API key is not configured.' })
  }

  const sentence = typeof req.body?.sentence === 'string' ? req.body.sentence.trim() : ''
  if (!sentence) {
    return res.status(400).json({ error: 'sentence is required.' })
  }
  if (sentence.length > 1200) {
    return res.status(400).json({ error: 'sentence is too long.' })
  }

  try {
    let lastError = 'Unknown Grok error'
    for (const model of MODEL_CANDIDATES) {
      const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Return only valid JSON.' },
            { role: 'user', content: buildPrompt(sentence) },
          ],
        }),
      })
      if (!response.ok) {
        const errText = await response.text()
        lastError = `model=${model}, status=${response.status}, body=${errText}`
        if (response.status === 400 && errText.includes('Model not found')) continue
        return res.status(500).json({ error: `Grok request failed: ${lastError}` })
      }
      const json = await response.json()
      const content = json?.choices?.[0]?.message?.content?.trim?.() ?? ''
      if (!content) return res.status(502).json({ error: 'Empty response from Grok.' })
      const cleaned = content.startsWith('```')
        ? content.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```$/m, '').trim()
        : content
      const analysis = JSON.parse(cleaned)
      return res.status(200).json({ analysis })
    }
    return res.status(500).json({ error: `No available Grok model: ${lastError}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Grok request failed.'
    return res.status(500).json({ error: message })
  }
}
