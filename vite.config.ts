import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL_CANDIDATES = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
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

async function callGroq(apiKey: string, prompt: string, modelCandidates: string[]) {
  let lastError = 'Unknown Groq error'
  for (const model of modelCandidates) {
    const bodyWithJsonFormat = {
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    }

    const bodyWithoutJsonFormat = {
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Return only valid JSON.' },
        { role: 'user', content: prompt },
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

      // Some Groq models/configs may reject `response_format`. Retry without it.
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
          throw new Error(`Groq request failed: model=${model}, status=${response.status}, body=${retryErrText}`)
        }
      } else {
        throw new Error(`Groq request failed: ${lastError}`)
      }
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error('Groq response is empty.')

    try {
      return JSON.parse(stripCodeFence(content)) as unknown
    } catch {
      throw new Error('Invalid JSON format from Groq.')
    }
  }
  throw new Error(`No available Groq model: ${lastError}`)
}

function groqApiPlugin(apiKey: string | undefined, modelCandidates: string[]): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST' || req.url !== '/api/analyze-sentence-grammar') {
      next()
      return
    }
    if (!apiKey) {
      sendJson(res, 500, { error: 'Groq API key is not configured.' })
      return
    }

    try {
      const body = (await readJsonBody(req)) as { sentence?: unknown }
      const sentence = typeof body?.sentence === 'string' ? body.sentence.trim() : ''
      if (!sentence) {
        sendJson(res, 400, { error: 'sentence is required.' })
        return
      }

      const parsed = await callGroq(apiKey, buildGrammarPrompt(sentence), modelCandidates)
      sendJson(res, 200, { analysis: parsed })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Groq request failed.'
      sendJson(res, 500, { error: message })
    }
  }

  return {
    name: 'groq-api-dev-middleware',
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
    env.GROQ_API_KEY ||
    env.NEXT_PUBLIC_GROQ_API_KEY ||
    env.NEXT_PUBLIC_GEMINI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY ||
    process.env.GROK_API_KEY || // backward-compat
    process.env.NEXT_PUBLIC_GROK_API_KEY || // backward-compat
    process.env.NEXT_PUBLIC_GEMINI_API_KEY

  const modelCandidates = [env.GROQ_MODEL, env.GROK_MODEL, process.env.GROQ_MODEL, process.env.GROK_MODEL, ...DEFAULT_MODEL_CANDIDATES].filter(
    Boolean,
  ) as string[]

  return {
    plugins: [react(), groqApiPlugin(apiKey, modelCandidates)],
  }
})

