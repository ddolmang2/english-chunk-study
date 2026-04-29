import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

const XAI_BASE_URL = 'https://api.x.ai/v1'
const MODEL_CANDIDATES = ['grok-3-mini', 'grok-3', 'grok-4-0709', 'grok-code-fast-1']

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

async function callGrok(apiKey: string, prompt: string) {
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
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!response.ok) {
      const errText = await response.text()
      lastError = `model=${model}, status=${response.status}, body=${errText}`
      if (response.status === 400 && errText.includes('Model not found')) continue
      throw new Error(`Grok request failed: ${lastError}`)
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error('Grok response is empty.')

    try {
      return JSON.parse(stripCodeFence(content)) as unknown
    } catch {
      throw new Error('Invalid JSON format from Grok.')
    }
  }
  throw new Error(`No available Grok model: ${lastError}`)
}

function grokApiPlugin(apiKey: string | undefined): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST' || req.url !== '/api/analyze-sentence-grammar') {
      next()
      return
    }
    if (!apiKey) {
      sendJson(res, 500, { error: 'Grok API key is not configured.' })
      return
    }

    try {
      const body = (await readJsonBody(req)) as { sentence?: unknown }
      const sentence = typeof body?.sentence === 'string' ? body.sentence.trim() : ''
      if (!sentence) {
        sendJson(res, 400, { error: 'sentence is required.' })
        return
      }

      const parsed = await callGrok(apiKey, buildGrammarPrompt(sentence))
      sendJson(res, 200, { analysis: parsed })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Grok request failed.'
      sendJson(res, 500, { error: message })
    }
  }

  return {
    name: 'grok-api-dev-middleware',
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
    env.GROK_API_KEY ||
    env.NEXT_PUBLIC_GROK_API_KEY ||
    env.NEXT_PUBLIC_GEMINI_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.NEXT_PUBLIC_GROK_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY

  return {
    plugins: [react(), grokApiPlugin(apiKey)],
  }
})

