import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import nlp from 'compromise'
import { analyzeSentenceGrammar, type GeminiGrammarAnalysis } from '../services/geminiGrammarAnalysis'

GlobalWorkerOptions.workerSrc = pdfWorker

type PageData = {
  pageNumber: number
  text: string
}

type Match = {
  id: string
  chunk: string
  start: number
  end: number
}

type Blank = Match & {
  index: number
}

type HighlightRange = {
  start: number
  end: number
  type: 'subject' | 'verb' | 'object'
}

type PositionedText = {
  text: string
  x: number
  y: number
  width: number
}

type ParsedSentence = {
  id: string
  text: string
  start: number
  end: number
}

const DEFAULT_CHUNKS = [
  'zero trust',
  'least privilege',
  'attack surface',
  'security posture',
  'defense in depth',
  'threat modeling',
  'data exfiltration',
  'incident response',
  'access control',
  'vulnerability scan',
  'security baseline',
  'credential stuffing',
  'penetration testing',
  'business continuity',
  'risk assessment',
  'compensating control',
  'identity provider',
  'single sign-on',
  'multi-factor authentication',
  'privileged account',
  'network segmentation',
  'kill chain',
  'security awareness',
  'red team',
  'blue team',
  'tabletop exercise',
  'audit trail',
  'token rotation',
  'patch management',
  'supply chain attack',
  'firewall policy',
  'service level agreement',
  'change management',
  'due diligence',
  'root cause analysis',
  'narnia-like wonder',
  'step into the wardrobe',
  'at the drop of a hat',
  'once in a blue moon',
  'break the ice',
  'on the same page',
  'raise the bar',
  'get the ball rolling',
  'think outside the box',
  'in the long run',
  'pull the plug',
  'back to square one',
  'keep an eye on',
  'rule of thumb',
  'under the weather',
]

const EXAMPLE_MAP: Record<string, string> = {
  'zero trust': 'Zero trust architecture verifies every request before granting access.',
  'least privilege': 'Apply least privilege so each analyst gets only required permissions.',
  'defense in depth': 'Defense in depth adds multiple safeguards across endpoint, network, and identity layers.',
  'incident response': 'Our incident response playbook reduced recovery time during a phishing event.',
  'risk assessment': 'Quarterly risk assessment highlights which controls need immediate investment.',
  'on the same page': 'Before launch, product and security teams got on the same page.',
  'keep an eye on': 'Keep an eye on unusual login spikes after policy changes.',
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shuffle<T>(arr: T[]) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function normalizeChunk(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function chunkWordCount(value: string) {
  return normalizeChunk(value).split(' ').filter(Boolean).length
}

function isMeaningfulClozeChunk(value: string) {
  const words = chunkWordCount(value)
  return words >= 2 && words <= 4
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'to',
  'for',
  'of',
  'on',
  'in',
  'at',
  'by',
  'with',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'this',
  'that',
  'these',
  'those',
  'we',
  'you',
  'they',
  'he',
  'she',
  'i',
])

const NON_VERB_CONTEXT_WORDS = new Set([
  'when',
  'then',
  'ago',
  'while',
  'although',
  'though',
  'however',
  'therefore',
  'moreover',
  'meanwhile',
  'afterward',
  'beforehand',
  'yesterday',
  'today',
  'tomorrow',
])

const PREPOSITIONS = new Set([
  'to',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'over',
  'under',
  'against',
  'across',
  'through',
  'around',
  'about',
  'between',
  'among',
  'within',
  'without',
  'after',
  'before',
  'during',
  'via',
  'upon',
  'off',
  'out',
  'up',
  'down',
  'on',
  'in',
  'at',
  'by',
])

type PosInfo = {
  verb: boolean
  noun: boolean
  pronoun: boolean
  determiner: boolean
  adjective: boolean
  adverb: boolean
  conjunction: boolean
  auxiliary: boolean
}

const POS_CACHE = new Map<string, PosInfo>()

function getPosInfo(word: string): PosInfo {
  const key = word.toLowerCase()
  const cached = POS_CACHE.get(key)
  if (cached) return cached

  let value: PosInfo
  try {
    const doc = nlp(word)
    const json = doc.json() as Array<{ terms?: Array<{ tags?: string[] }> }>
    const tags = new Set((json[0]?.terms?.[0]?.tags ?? []).map((tag) => String(tag)))
    value = {
      verb: tags.has('Verb'),
      noun: tags.has('Noun'),
      pronoun: tags.has('Pronoun'),
      determiner: tags.has('Determiner'),
      adjective: tags.has('Adjective'),
      adverb: tags.has('Adverb'),
      conjunction: tags.has('Conjunction'),
      auxiliary: tags.has('Auxiliary'),
    }
  } catch (error) {
    console.error('POS parsing failed:', error)
    value = {
      verb: false,
      noun: false,
      pronoun: false,
      determiner: false,
      adjective: false,
      adverb: false,
      conjunction: false,
      auxiliary: false,
    }
  }
  POS_CACHE.set(key, value)
  return value
}

function isLikelyVerb(word: string) {
  const w = word.toLowerCase()
  if (w.length < 2 || NON_VERB_CONTEXT_WORDS.has(w)) return false
  const pos = getPosInfo(w)
  if (pos.adverb || pos.conjunction) return false
  if (STOPWORDS.has(w) && !['is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had'].includes(w))
    return false

  // Treat be/have families as verbs for highlighting.
  if (['is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'have', 'has', 'had'].includes(w)) return true
  if (pos.verb) return true

  const strongVerbs = [
    'make',
    'take',
    'give',
    'get',
    'set',
    'keep',
    'run',
    'build',
    'manage',
    'monitor',
    'track',
    'detect',
    'prevent',
    'reduce',
    'increase',
    'improve',
    'review',
    'analyze',
    'assess',
    'control',
    'secure',
    'protect',
    'apply',
    'define',
    'create',
    'deploy',
    'respond',
    'report',
    'handle',
    'support',
    'design',
  ]
  if (strongVerbs.includes(w)) return true
  return /(ed|ing|ize|ise|fy|en|ate|tect|vent|duce|port|form|ply)$/.test(w)
}

function isLikelyNoun(word: string) {
  const w = word.toLowerCase()
  if (w.length < 3 || STOPWORDS.has(w) || PREPOSITIONS.has(w)) return false
  if (getPosInfo(w).noun) return true
  return /(tion|sion|ment|ness|ity|ship|ance|ence|risk|policy|control|system|access|response|attack|threat)$/.test(w)
}

function isLikelyNounToken(word: string) {
  const w = word.toLowerCase()
  if (w.length < 2 || PREPOSITIONS.has(w)) return false
  const pos = getPosInfo(w)
  if (pos.pronoun || pos.noun || pos.adjective || pos.determiner) return true
  if (STOPWORDS.has(w) && !['the', 'a', 'an', 'this', 'that', 'these', 'those'].includes(w)) return false
  if (/^[A-Z]/.test(word)) return true
  return (
    isLikelyNoun(word) ||
    /(ion|ment|ness|ity|ship|ance|ence|er|or|ist|ism|age|ure|al|ity|ics|logy|hood|dom|cy|ty|ses|sis|ies|s)$/.test(w)
  )
}

function isNounPhraseGlue(word: string) {
  const w = word.toLowerCase()
  return ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their', 'its', 'of', 'and'].includes(w)
}

function isVerbCentricChunk(value: string) {
  const words = normalizeChunk(value).split(' ').filter(Boolean)
  if (words.length < 2 || words.length > 4) return false

  for (let i = 0; i < words.length - 1; i += 1) {
    if (isLikelyVerb(words[i]) && PREPOSITIONS.has(words[i + 1])) return true
    if (isLikelyVerb(words[i]) && isLikelyNoun(words[i + 1])) return true
  }
  return false
}

function hasVerbToken(value: string) {
  const words = normalizeChunk(value).split(' ').filter(Boolean)
  return words.some((word) => isLikelyVerb(word))
}

function rankChunkScore(value: string) {
  const words = normalizeChunk(value).split(' ').filter(Boolean)
  const wordCountScore = (4 - Math.abs(3 - words.length)) * 8
  const verbCentricBonus = isVerbCentricChunk(value) ? 30 : 0
  const nounBonus = words.some((w) => isLikelyNoun(w)) ? 8 : 0
  return wordCountScore + verbCentricBonus + nounBonus
}

function buildFallbackMatches(pageText: string): Match[] {
  // If predefined chunks are not found, build candidates from 2~4-word verb-centric phrases.
  const tokens = Array.from(pageText.matchAll(/[A-Za-z][A-Za-z'-]{2,}(?:\s+[A-Za-z][A-Za-z'-]{2,}){1,3}/g))
  const unique = new Map<string, Match>()

  for (const token of tokens) {
    const phrase = token[0]
    const start = token.index ?? -1
    if (start < 0) continue
    if (!isMeaningfulClozeChunk(phrase)) continue
    if (!isVerbCentricChunk(phrase)) continue
    const end = start + phrase.length
    const key = normalizeChunk(phrase)
    if (unique.has(key)) continue

    unique.set(key, {
      id: crypto.randomUUID(),
      chunk: phrase,
      start,
      end,
    })
  }

  return [...unique.values()]
}

function buildPageBlanks(pageText: string, chunkList: string[]): Blank[] {
  const allMatches: Match[] = []
  const sortedChunks = [...chunkList]
    .map((chunk) => chunk.trim())
    .filter((chunk) => isMeaningfulClozeChunk(chunk))
    .filter((chunk) => isVerbCentricChunk(chunk))
    .sort((a, b) => b.length - a.length)

  sortedChunks.forEach((chunk) => {
    const re = new RegExp(`\\b${escapeRegExp(chunk)}\\b`, 'gi')
    for (const hit of pageText.matchAll(re)) {
      const start = hit.index ?? -1
      const matchedText = hit[0]
      if (start < 0) continue
      const end = start + matchedText.length

      const overlaps = allMatches.some((item) => !(end <= item.start || start >= item.end))
      if (!overlaps) {
        allMatches.push({
          id: crypto.randomUUID(),
          chunk: matchedText,
          start,
          end,
        })
      }
    }
  })

  const source = allMatches.length > 0 ? allMatches : buildFallbackMatches(pageText)
  const safeSource = source.filter((item) => isMeaningfulClozeChunk(item.chunk) && isVerbCentricChunk(item.chunk))
  const ranked = [...safeSource].sort((a, b) => rankChunkScore(b.chunk) - rankChunkScore(a.chunk))
  const candidatePool = ranked.slice(0, Math.max(12, Math.floor(ranked.length * 0.7)))
  const count = Math.min(candidatePool.length, 8 + Math.floor(Math.random() * 3))
  return shuffle(candidatePool)
    .slice(0, count)
    .sort((a, b) => a.start - b.start)
    .map((item, index) => ({ ...item, index }))
}

function renderWithBlanks(pageText: string, blanks: Blank[]) {
  if (!blanks.length) {
    return [{ type: 'text' as const, content: pageText, start: 0, end: pageText.length }]
  }

  const output: Array<
    | { type: 'text'; content: string; start: number; end: number }
    | { type: 'blank'; id: string; answer: string; blankIndex: number; start: number; end: number }
  > = []
  let cursor = 0

  blanks.forEach((blank) => {
    if (blank.start > cursor) {
      output.push({ type: 'text', content: pageText.slice(cursor, blank.start), start: cursor, end: blank.start })
    }
    output.push({
      type: 'blank',
      id: blank.id,
      answer: blank.chunk,
      blankIndex: blank.index,
      start: blank.start,
      end: blank.end,
    })
    cursor = blank.end
  })

  if (cursor < pageText.length) {
    output.push({ type: 'text', content: pageText.slice(cursor), start: cursor, end: pageText.length })
  }

  return output
}

function detectHighlightRanges(text: string): HighlightRange[] {
  const ranges: HighlightRange[] = []
  const sentenceRegex = /[^.!?\n]+[.!?]?/g

  for (const sentenceMatch of text.matchAll(sentenceRegex)) {
    const sentence = sentenceMatch[0]
    const sentenceStart = sentenceMatch.index ?? -1
    if (sentenceStart < 0) continue

    const words = Array.from(sentence.matchAll(/[A-Za-z][A-Za-z'-]*/g)).map((m) => ({
      word: m[0],
      start: sentenceStart + (m.index ?? 0),
      end: sentenceStart + (m.index ?? 0) + m[0].length,
    }))
    if (!words.length) continue

    let verbIdx = -1
    let auxVerbIdx = -1
    for (let i = 0; i < words.length; i += 1) {
      const lower = words[i].word.toLowerCase()
      if (!isLikelyVerb(lower)) continue
      const pos = getPosInfo(lower)
      if (!pos.auxiliary && verbIdx < 0) {
        verbIdx = i
        break
      }
      if (auxVerbIdx < 0) auxVerbIdx = i
    }
    if (verbIdx < 0) verbIdx = auxVerbIdx
    if (verbIdx >= 0) {
      ranges.push({ start: words[verbIdx].start, end: words[verbIdx].end, type: 'verb' })
    }

    let subjectIdx = -1
    const pronouns = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it'])
    for (let i = 0; i < (verbIdx >= 0 ? verbIdx : words.length); i += 1) {
      const lower = words[i].word.toLowerCase()
      if (pronouns.has(lower)) {
        subjectIdx = i
        break
      }
      if (isLikelyNounToken(words[i].word)) {
        subjectIdx = i
        break
      }
      if ((lower === 'the' || lower === 'a' || lower === 'an') && i + 1 < words.length) {
        subjectIdx = i
        break
      }
      if (/^[A-Z]/.test(words[i].word) && i > 0) {
        subjectIdx = i
        break
      }
    }

    if (subjectIdx >= 0) {
      let subjectStartIdx = subjectIdx
      let subjectEndIdx = subjectIdx

      // Expand backward for determiners in noun phrase.
      for (let i = subjectIdx - 1; i >= 0; i -= 1) {
        const w = words[i].word
        if (isNounPhraseGlue(w)) {
          subjectStartIdx = i
          continue
        }
        break
      }

      // Expand forward to capture full noun phrase up to verb boundary.
      const limit = verbIdx >= 0 ? verbIdx : words.length
      for (let i = subjectIdx + 1; i < limit; i += 1) {
        const w = words[i].word
        if (isLikelyNounToken(w) || isNounPhraseGlue(w)) {
          subjectEndIdx = i
          continue
        }
        if (PREPOSITIONS.has(w.toLowerCase()) && i + 1 < limit && isLikelyNounToken(words[i + 1].word)) {
          subjectEndIdx = i + 1
          i += 1
          continue
        }
        break
      }

      ranges.push({
        start: words[subjectStartIdx].start,
        end: words[subjectEndIdx].end,
        type: 'subject',
      })
    }
  }

  return ranges.sort((a, b) => a.start - b.start || (a.type === 'verb' ? -1 : 1))
}

function extractParsedSentences(text: string): ParsedSentence[] {
  return Array.from(text.matchAll(/[^.!?\n]+[.!?]?/g))
    .map((m, idx) => {
      const raw = m[0]
      const cleaned = raw.trim()
      if (!cleaned) return null
      const localStart = raw.indexOf(cleaned)
      const start = (m.index ?? 0) + Math.max(0, localStart)
      const end = start + cleaned.length
      return { id: `s-${idx}-${start}`, text: cleaned, start, end }
    })
    .filter((v): v is ParsedSentence => Boolean(v))
}

function buildPhraseRange(sentence: ParsedSentence, phrase: string, type: HighlightRange['type']): HighlightRange | null {
  const normalized = phrase.trim()
  if (!normalized) return null
  const re = new RegExp(`\\b${escapeRegExp(normalized)}\\b`, 'i')
  const hit = re.exec(sentence.text)
  if (!hit) return null
  const localStart = hit.index ?? -1
  if (localStart < 0) return null
  return {
    start: sentence.start + localStart,
    end: sentence.start + localStart + hit[0].length,
    type,
  }
}

function buildGeminiRangesForSentence(sentence: ParsedSentence, analysis: GeminiGrammarAnalysis): HighlightRange[] {
  const ranges: HighlightRange[] = []
  const subjectRange = buildPhraseRange(sentence, analysis.grammar_analysis.subject, 'subject')
  const verbRange = buildPhraseRange(sentence, analysis.grammar_analysis.verb, 'verb')
  const objectRange = buildPhraseRange(sentence, analysis.grammar_analysis.object, 'object')
  if (subjectRange) ranges.push(subjectRange)
  if (verbRange) ranges.push(verbRange)
  if (objectRange) ranges.push(objectRange)
  return ranges
}

function renderHighlightedText(
  segment: string,
  segmentStart: number,
  highlights: HighlightRange[],
  enabled: boolean,
) {
  if (!enabled || !segment) return segment
  const segmentEnd = segmentStart + segment.length
  const overlaps = highlights.filter((h) => h.start < segmentEnd && h.end > segmentStart)
  if (!overlaps.length) return segment

  const nodes: ReactNode[] = []
  let cursor = segmentStart

  overlaps.forEach((h, idx) => {
    const from = Math.max(h.start, segmentStart)
    const to = Math.min(h.end, segmentEnd)
    if (from > cursor) {
      nodes.push(segment.slice(cursor - segmentStart, from - segmentStart))
    }
    nodes.push(
      <span
        key={`${segmentStart}-${idx}-${h.type}`}
        className={h.type === 'verb' ? 'hlVerb' : h.type === 'object' ? 'hlObject' : 'hlSubject'}
      >
        {segment.slice(from - segmentStart, to - segmentStart)}
      </span>,
    )
    cursor = to
  })

  if (cursor < segmentEnd) {
    nodes.push(segment.slice(cursor - segmentStart))
  }

  return nodes
}

function rebuildPageTextWithLayout(rawItems: unknown[]): string {
  const items: PositionedText[] = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item)) {
        return null
      }
      const text = String(item.str ?? '')
      const transform = Array.isArray(item.transform) ? item.transform : []
      const x = Number(transform[4] ?? 0)
      const y = Number(transform[5] ?? 0)
      const width = Number(('width' in item && item.width) || text.length * 4)
      return { text, x, y, width }
    })
    .filter((v): v is PositionedText => Boolean(v && v.text.trim()))

  if (!items.length) return ''

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 2) return b.y - a.y
    return a.x - b.x
  })

  const lines: Array<{ y: number; items: PositionedText[] }> = []
  for (const item of sorted) {
    const last = lines.at(-1)
    if (!last || Math.abs(last.y - item.y) > 3) {
      lines.push({ y: item.y, items: [item] })
    } else {
      last.items.push(item)
    }
  }

  const lineTexts: string[] = []
  let prevY: number | null = null

  for (const line of lines) {
    const byX = [...line.items].sort((a, b) => a.x - b.x)
    let rendered = ''
    let prevEndX: number | null = null
    let prevAvgChar = 5

    for (const token of byX) {
      if (prevEndX !== null) {
        const gap = token.x - prevEndX
        if (gap > prevAvgChar * 0.9) {
          const spaces = Math.max(1, Math.min(8, Math.round(gap / prevAvgChar)))
          rendered += ' '.repeat(spaces)
        }
      }
      rendered += token.text
      prevAvgChar = token.width / Math.max(1, token.text.length)
      prevEndX = token.x + token.width
    }

    if (prevY !== null && prevY - line.y > 18) {
      lineTexts.push('')
    }
    lineTexts.push(rendered)
    prevY = line.y
  }

  // Preserve original leading/trailing spacing and paragraph breaks as much as possible.
  return lineTexts.join('\n')
}

async function extractPdfPages(file: File): Promise<PageData[]> {
  const raw = await file.arrayBuffer()
  const loading = getDocument({ data: raw })
  const pdf = await loading.promise
  const pages: PageData[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = rebuildPageTextWithLayout(content.items)
    pages.push({ pageNumber, text })
  }

  return pages
}

export function ClozeWorkbookRoute() {
  const uiBuildTag = 'pdf-ai-click-debug-v1'
  const [pages, setPages] = useState<PageData[]>([])
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [chunkInput, setChunkInput] = useState(DEFAULT_CHUNKS.join('\n'))
  const [currentPageNumber, setCurrentPageNumber] = useState(1)
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [droppedByBlankId, setDroppedByBlankId] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)
  const [example, setExample] = useState<string | null>(null)
  const [blankFeedbackById, setBlankFeedbackById] = useState<Record<string, { text: string; type: 'success' | 'error' }>>({})
  const [isParsing, setIsParsing] = useState(false)
  const [isHighlightOn, setIsHighlightOn] = useState(true)
  const [isOriginalOn, setIsOriginalOn] = useState(true)
  const [isPdfRendering, setIsPdfRendering] = useState(false)
  const [analysisBySentenceId, setAnalysisBySentenceId] = useState<Record<string, GeminiGrammarAnalysis>>({})
  const [activeSentenceId, setActiveSentenceId] = useState<string | null>(null)
  const [loadingSentenceId, setLoadingSentenceId] = useState<string | null>(null)
  const [sentenceError, setSentenceError] = useState<string | null>(null)
  const [hoverCount, setHoverCount] = useState(0)
  const [clickCount, setClickCount] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pdfDocRef = useRef<Awaited<ReturnType<typeof getDocument>>['promise'] extends Promise<infer T> ? T : never | null>(
    null,
  )

  const chunkList = useMemo(
    () =>
      chunkInput
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean),
    [chunkInput],
  )

  const currentPage = pages.find((p) => p.pageNumber === currentPageNumber)
  const blanks = useMemo(
    () => (currentPage ? buildPageBlanks(currentPage.text, chunkList) : []),
    [currentPage, chunkList, refreshSeed],
  )
  const tokens = useMemo(() => (currentPage ? renderWithBlanks(currentPage.text, blanks) : []), [currentPage, blanks])
  const pool = useMemo(() => shuffle(blanks.map((b) => ({ id: b.id, chunk: b.chunk }))), [blanks])
  const highlightRanges = useMemo(
    () => (currentPage ? detectHighlightRanges(currentPage.text) : []),
    [currentPage, refreshSeed],
  )
  const parsedSentences = useMemo(() => (currentPage ? extractParsedSentences(currentPage.text) : []), [currentPage])
  const analyzedSentenceIds = useMemo(
    () => new Set(Object.keys(analysisBySentenceId)),
    [analysisBySentenceId],
  )
  const geminiHighlightRanges = useMemo(() => {
    const ranges: HighlightRange[] = []
    for (const sentence of parsedSentences) {
      const analysis = analysisBySentenceId[sentence.id]
      if (!analysis) continue
      ranges.push(...buildGeminiRangesForSentence(sentence, analysis))
    }
    return ranges
  }, [parsedSentences, analysisBySentenceId])
  const localHighlightRanges = useMemo(() => {
    if (!analyzedSentenceIds.size) return highlightRanges
    return highlightRanges.filter((range) => {
      const ownerSentence = parsedSentences.find((sentence) => range.start >= sentence.start && range.end <= sentence.end)
      if (!ownerSentence) return true
      return !analyzedSentenceIds.has(ownerSentence.id)
    })
  }, [highlightRanges, parsedSentences, analyzedSentenceIds])
  const mergedHighlights = useMemo(
    () => [...localHighlightRanges, ...geminiHighlightRanges].sort((a, b) => a.start - b.start),
    [localHighlightRanges, geminiHighlightRanges],
  )

  const completeCount = Object.values(droppedByBlankId).filter(Boolean).length

  useEffect(() => {
    if (!message && !example) return
    const timer = window.setTimeout(() => {
      setMessage(null)
      setExample(null)
      setMessageType(null)
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [message, example])

  useEffect(() => {
    if (!pdfBytes) return
    const bytes = pdfBytes
    let cancelled = false

    async function loadPdfDocument() {
      try {
        const loadingTask = getDocument({ data: bytes.slice() })
        const pdf = await loadingTask.promise
        if (!cancelled) {
          pdfDocRef.current = pdf
        }
      } catch (error) {
        console.error('PDF load failed:', error)
      }
    }

    loadPdfDocument()
    return () => {
      cancelled = true
    }
  }, [pdfBytes])

  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || !currentPageNumber) return
    let cancelled = false

    async function renderPdfPage() {
      setIsPdfRendering(true)
      try {
        const page = await pdfDocRef.current?.getPage(currentPageNumber)
        if (!page || cancelled || !canvasRef.current) return

        const viewport = page.getViewport({ scale: 1.35 })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'

        await page.render({ canvas, canvasContext: ctx, viewport }).promise
      } catch (error) {
        console.error('PDF page render failed:', error)
      } finally {
        if (!cancelled) setIsPdfRendering(false)
      }
    }

    renderPdfPage()
    return () => {
      cancelled = true
    }
  }, [currentPageNumber, pages.length])

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setIsParsing(true)
    setMessage(null)
    setMessageType(null)
    setExample(null)

    try {
      const raw = await file.arrayBuffer()
      const parsedPages = await extractPdfPages(file)
      setPdfBytes(new Uint8Array(raw))
      setPages(parsedPages)
      setCurrentPageNumber(1)
      setDroppedByBlankId({})
      setAnalysisBySentenceId({})
      setActiveSentenceId(null)
      setSentenceError(null)
      setRefreshSeed((n) => n + 1)
      setMessage(`${parsedPages.length}개 페이지를 불러왔습니다.`)
      setMessageType('success')
    } catch (error) {
      console.error(error)
      setMessage('PDF 파싱 중 오류가 발생했습니다. 다른 파일로 시도해 주세요.')
      setMessageType('error')
    } finally {
      setIsParsing(false)
    }
  }

  function openPage(pageNumber: number) {
    setCurrentPageNumber(pageNumber)
    setDroppedByBlankId({})
    setExample(null)
    setMessage(null)
    setMessageType(null)
    setRefreshSeed((n) => n + 1)
    setAnalysisBySentenceId({})
    setActiveSentenceId(null)
    setSentenceError(null)
  }

  function onDragStart(event: DragEvent<HTMLButtonElement>, chunk: string) {
    event.dataTransfer.setData('text/plain', chunk)
    event.dataTransfer.effectAllowed = 'move'
  }

  function onDropBlank(event: DragEvent<HTMLSpanElement>, blank: Blank) {
    event.preventDefault()
    const droppedChunk = event.dataTransfer.getData('text/plain')
    if (!droppedChunk) return

    if (normalizeChunk(droppedChunk) === normalizeChunk(blank.chunk)) {
      setDroppedByBlankId((prev) => ({ ...prev, [blank.id]: droppedChunk }))
      setBlankFeedbackById((prev) => ({ ...prev, [blank.id]: { text: '정답!', type: 'success' } }))
      const key = normalizeChunk(blank.chunk)
      setExample(
        EXAMPLE_MAP[key] ?? `${blank.chunk} 관련 실무 예문을 여기에 연결하세요. (예: 보안/비즈니스 문장 DB 연동)`,
      )
      setMessage(`정답! "${blank.chunk}"`)
      setMessageType('success')
      window.setTimeout(() => {
        setBlankFeedbackById((prev) => {
          const next = { ...prev }
          delete next[blank.id]
          return next
        })
      }, 1500)
      return
    }

    setMessage(`오답입니다. "${blank.index + 1}번 빈칸"을 다시 시도하세요.`)
    setMessageType('error')
    setBlankFeedbackById((prev) => ({ ...prev, [blank.id]: { text: '오답', type: 'error' } }))
    window.setTimeout(() => {
      setBlankFeedbackById((prev) => {
        const next = { ...prev }
        delete next[blank.id]
        return next
      })
    }, 1300)
  }

  function onAllowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
  }

  async function onClickSentence(sentence: ParsedSentence) {
    setActiveSentenceId(sentence.id)
    setSentenceError(null)
    if (analysisBySentenceId[sentence.id]) return
    setLoadingSentenceId(sentence.id)
    try {
      const analysis = await analyzeSentenceGrammar(sentence.text)
      setAnalysisBySentenceId((prev) => ({ ...prev, [sentence.id]: analysis }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : '문장 분석 중 오류가 발생했습니다.'
      setSentenceError(msg)
    } finally {
      setLoadingSentenceId(null)
    }
  }

  function onClickSentenceInBody(offset: number) {
    const sentence = parsedSentences.find((item) => offset >= item.start && offset < item.end)
    if (!sentence) return
    setMessage(`문장 ${parsedSentences.findIndex((s) => s.id === sentence.id) + 1} 분석 요청 중...`)
    setMessageType('success')
    void onClickSentence(sentence)
  }

  function onClickClozeText(event: React.MouseEvent<HTMLParagraphElement>) {
    const target = event.target as HTMLElement | null
    if (!target) return
    const tokenEl = target.closest<HTMLElement>('[data-offset]')
    if (!tokenEl) return
    const raw = tokenEl.dataset.offset
    if (!raw) return
    const offset = Number(raw)
    if (!Number.isFinite(offset)) return
    onClickSentenceInBody(offset)
  }

  function renderSentenceText(sentence: ParsedSentence, analysis?: GeminiGrammarAnalysis) {
    if (!analysis) return sentence.text
    const ranges = buildGeminiRangesForSentence(sentence, analysis)
    return renderHighlightedText(sentence.text, sentence.start, ranges, true)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="appTitle">AI Sentence Coach</div>
          <div className="appSubtitle">실시간 AI 과외 선생님 · 문법 근거 기반 하이라이트</div>
        </div>
        <Link className="btn" to="/">
          홈으로
        </Link>
      </header>

      <main className="container clozeContainer">
        <section className="card">
          <div className="rowBetween">
            <label className="btn" htmlFor="pdf-upload">
              PDF 업로드
            </label>
            <button className="btn" onClick={() => setIsHighlightOn((v) => !v)} disabled={!currentPage}>
              Highlight {isHighlightOn ? 'On' : 'Off'}
            </button>
          </div>
          <input id="pdf-upload" type="file" accept="application/pdf" onChange={onUpload} style={{ display: 'none' }} />
          <p className="muted">{isParsing ? 'PDF 텍스트 파싱 중...' : '브라우저 메모리 내 임시 저장으로 동작합니다.'}</p>
        </section>

        <section className="card section">
          <div className="label">학습용 청크 리스트 (줄바꿈 구분)</div>
          <textarea
            className="textarea"
            value={chunkInput}
            onChange={(e) => setChunkInput(e.target.value)}
            placeholder="예: zero trust"
          />
          <p className="muted">보안 청크 500개/숙어 목록을 여기에 확장하면 동일 로직으로 즉시 반영됩니다.</p>
        </section>

        {pages.length > 0 && (
          <section className="card section">
            <div className="label">페이지 선택</div>
            <div className="chips">
              {pages.map((page) => (
                <button
                  key={page.pageNumber}
                  className={`chip chipOption ${page.pageNumber === currentPageNumber ? 'chipPicked' : ''}`}
                  onClick={() => openPage(page.pageNumber)}
                >
                  {page.pageNumber}p
                </button>
              ))}
            </div>
          </section>
        )}

        {currentPage && (
          <section className="clozeBoard section">
            <article className="card clozeTextCard">
              <div className="rowBetween">
                <div className="cardTitle">Page {currentPage.pageNumber}</div>
                <div className="muted">
                  완료 {completeCount}/{blanks.length}
                </div>
              </div>
              {(message || example) && (
                <div className={`clozeToast ${messageType === 'error' ? 'error' : 'success'}`}>
                  {message && <div className="resultTitle">{message}</div>}
                  {example && <div className="clozeToastExample">{example}</div>}
                </div>
              )}
              {isOriginalOn && (
                <div className="pdfPreviewWrap">
                  <div className="label">원본 PDF 렌더</div>
                  <div className="pdfCanvasBox">
                    <canvas ref={canvasRef} className="pdfCanvas" />
                  </div>
                  {isPdfRendering && <div className="muted">PDF 페이지 렌더링 중...</div>}
                </div>
              )}

              <div className="label section">클로즈 학습 본문</div>

              <p
                className="clozeText"
                onClick={(e) => {
                  setClickCount((v) => v + 1)
                  onClickClozeText(e)
                }}
                onMouseEnter={() => setHoverCount((v) => v + 1)}
                style={{ cursor: 'pointer' }}
              >
                {tokens.map((token, idx) => {
                  if (token.type === 'text') {
                    return (
                      <span
                        key={`t-${idx}`}
                        className="clozeTextToken clozeClickableSentence"
                        title="클릭해서 AI 문장 분석 보기"
                        data-offset={token.start}
                      >
                        {renderHighlightedText(token.content, token.start, mergedHighlights, isHighlightOn)}
                      </span>
                    )
                  }

                  const blank = blanks.find((b) => b.id === token.id)
                  const dropped = droppedByBlankId[token.id]
                  const isVerbBlank = hasVerbToken(token.answer)
                  return (
                    <span
                      key={token.id}
                      className={`blankSlot ${dropped ? 'blankSolved' : ''} ${isVerbBlank && isHighlightOn ? 'blankVerb' : ''}`}
                      onDrop={(e) => blank && onDropBlank(e, blank)}
                      onDragOver={onAllowDrop}
                      title="클릭해서 AI 문장 분석 보기"
                      data-offset={token.start}
                    >
                      {dropped ?? '[ ______ ]'}
                      {blankFeedbackById[token.id] && (
                        <span className={`blankFeedback ${blankFeedbackById[token.id].type}`}>
                          {blankFeedbackById[token.id].text}
                        </span>
                      )}
                    </span>
                  )
                })}
              </p>
            </article>

            <aside className="card chunkPoolCard">
              <div className="cardTitle">Chunk Pool</div>
              <p className="muted">카드를 드래그해서 왼쪽 빈칸에 드롭하세요.</p>
              <div className="row chunkPoolControls">
                <button className="btn" onClick={() => setRefreshSeed((n) => n + 1)} disabled={!currentPage}>
                  현재 페이지 빈칸 다시 섞기
                </button>
                <button className="btn" onClick={() => setIsOriginalOn((v) => !v)} disabled={!currentPage}>
                  Original {isOriginalOn ? 'On' : 'Off'}
                </button>
              </div>
              <div className="chunkPool">
                {pool.map((item) => {
                  const alreadyUsed = Object.values(droppedByBlankId).includes(item.chunk)
                  return (
                    <button
                      key={item.id}
                      className="chip chipOption"
                      draggable={!alreadyUsed}
                      onDragStart={(e) => onDragStart(e, item.chunk)}
                      disabled={alreadyUsed}
                    >
                      {item.chunk}
                    </button>
                  )
                })}
              </div>
            </aside>
          </section>
        )}

        {currentPage && parsedSentences.length > 0 && (
          <section className="card section">
            <div className="rowBetween">
              <div className="cardTitle">파싱 문장 리스트</div>
              <div className="muted">문장을 클릭하면 Gemini 분석 카드가 아래로 열립니다.</div>
            </div>
            <div className="sentenceList">
              {parsedSentences.map((sentence, idx) => {
                const analysis = analysisBySentenceId[sentence.id]
                const isAiVerified = Boolean(analysis)
                const open = activeSentenceId === sentence.id
                const loading = loadingSentenceId === sentence.id
                return (
                  <div key={sentence.id} className="sentenceItem">
                    <button className="sentenceBtn" onClick={() => onClickSentence(sentence)}>
                      <span className="sentenceMainText">
                        <span className="sentenceIndex">{idx + 1}.</span> {renderSentenceText(sentence, analysis)}
                      </span>
                      {isAiVerified && <span className="sentenceVerified">AI 검증됨</span>}
                    </button>
                    <div className={`sentencePanel ${open ? 'open' : ''}`}>
                      {loading && <div className="muted">Gemini가 문장을 분석하는 중...</div>}
                      {!loading && analysis && (
                        <>
                          <div className="sentenceMeta">
                            <span className="badgeSubj">Subject: {analysis.grammar_analysis.subject || '-'}</span>
                            <span className="badgeVerb">Verb: {analysis.grammar_analysis.verb || '-'}</span>
                            <span className="badgeObj">Object: {analysis.grammar_analysis.object || '-'}</span>
                          </div>
                          <div className="sentenceDetail">
                            <strong>의역</strong>: {analysis.translation}
                          </div>
                          <div className="sentenceDetail">
                            <strong>학습 포인트</strong>: {analysis.learning_tip}
                          </div>
                        </>
                      )}
                      {!loading && open && !analysis && sentenceError && <div className="result no">{sentenceError}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {activeSentenceId && (
          <aside className="aiCoachFloatingCard">
            <div className="aiCoachTitle">AI Sentence Coach</div>
            <div className="aiCoachSentence">{parsedSentences.find((s) => s.id === activeSentenceId)?.text}</div>
            {loadingSentenceId === activeSentenceId && <div className="muted">Gemini가 분석 중입니다...</div>}
            {loadingSentenceId !== activeSentenceId && analysisBySentenceId[activeSentenceId] && (
              <>
                <div className="sentenceMeta" style={{ marginTop: 8 }}>
                  <span className="badgeSubj">S: {analysisBySentenceId[activeSentenceId].grammar_analysis.subject || '-'}</span>
                  <span className="badgeVerb">V: {analysisBySentenceId[activeSentenceId].grammar_analysis.verb || '-'}</span>
                  <span className="badgeObj">O: {analysisBySentenceId[activeSentenceId].grammar_analysis.object || '-'}</span>
                </div>
                <div className="sentenceDetail">
                  <strong>의역</strong>: {analysisBySentenceId[activeSentenceId].translation}
                </div>
                <div className="sentenceDetail">
                  <strong>포인트</strong>: {analysisBySentenceId[activeSentenceId].learning_tip}
                </div>
              </>
            )}
            {loadingSentenceId !== activeSentenceId && !analysisBySentenceId[activeSentenceId] && sentenceError && (
              <div className="result no">{sentenceError}</div>
            )}
          </aside>
        )}

        <aside className="aiCoachFloatingCard" style={{ left: 16, right: 'auto', bottom: 16, width: 280 }}>
          <div className="aiCoachTitle">UI Debug</div>
          <div className="muted">build: {uiBuildTag}</div>
          <div className="muted">hover events: {hoverCount}</div>
          <div className="muted">click events: {clickCount}</div>
        </aside>

        {currentPage && blanks.length === 0 && (
          <section className="card section">
            <div className="muted">
              현재 페이지에서 만들 수 있는 빈칸 후보를 찾지 못했습니다. 청크 리스트를 늘리거나 다른 페이지를 선택해 주세요.
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
