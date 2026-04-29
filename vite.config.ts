import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
]

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += String(chunk)
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, code: number, body: Record<string, unknown>) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function buildGrammarPrompt(sentence: string) {
  return [
    'You are an English tutor for Korean learners.',
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

function stripCodeFence(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```$/m, '').trim()
}

async function callGemini(apiKey: string, prompt: string, modelCandidates: string[]) {
  let lastError = 'Unknown Gemini error'
  for (const model of modelCandidates) {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
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
      throw new Error(`Gemini request failed: ${lastError}`)
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) throw new Error('Gemini response is empty.')

    try {
      return { parsed: JSON.parse(stripCodeFence(content)) as unknown, usedModel: model }
    } catch {
      throw new Error('Invalid JSON format from Gemini.')
    }
  }
  throw new Error(`No available Gemini model: ${lastError}`)
}

function geminiApiPlugin(apiKey: string | undefined, modelCandidates: string[]): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST' || req.url !== '/api/analyze-sentence-grammar') {
      next()
      return
    }
    if (!apiKey) {
      sendJson(res, 500, { error: 'Gemini API key is not configured.' })
      return
    }

    try {
      const body = (await readJsonBody(req)) as { sentence?: unknown }
      const sentence = typeof body?.sentence === 'string' ? body.sentence.trim() : ''
      if (!sentence) {
        sendJson(res, 400, { error: 'sentence is required.' })
        return
      }

      const result = await callGemini(apiKey, buildGrammarPrompt(sentence), modelCandidates)
      sendJson(res, 200, {
        analysis: result.parsed,
        meta: {
          usedModel: result.usedModel,
          usedBaseUrl: GEMINI_BASE_URL,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini request failed.'
      sendJson(res, 500, { error: message })
    }
  }

  return {
    name: 'gemini-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey =
    env.GEMINI_API_KEY ||
    env.NEXT_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY

  const modelCandidates = [
    env.GEMINI_MODEL,
    env.NEXT_PUBLIC_GEMINI_MODEL,
    process.env.GEMINI_MODEL,
    process.env.NEXT_PUBLIC_GEMINI_MODEL,
    ...DEFAULT_MODEL_CANDIDATES,
  ].filter(Boolean) as string[]

  return {
    plugins: [react(), geminiApiPlugin(apiKey, modelCandidates)],
  }
})

