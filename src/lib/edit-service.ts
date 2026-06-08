import Anthropic from '@anthropic-ai/sdk'

export interface EditContext {
  source: string
  heading?: string
  text: string
}
export interface EditRequest {
  blockText: string
  instruction: string
  context?: EditContext[] // retrieved KB passages to ground the edit in
}
export interface EditResponse {
  proposedText: string
  rationale: string
  changedEntities: string[] // entities the edit intentionally changed; [] = none (faithfulness)
  clarification?: string // set when the model can't/won't edit — show a question, NOT a diff
  groundedIn?: string[] // KB source titles the edit actually drew from
  sources?: { id: string; title: string }[] // the KB docs fed as context (for linking the citation)
}
export interface EditService {
  proposeEdit(req: EditRequest): Promise<EditResponse>
}

const FILLER = /\b(really|very|quite|just|actually|basically|simply)\b/gi
const cap = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s)

// Deterministic, token-free. Drives the whole loop before the proxy token lands.
export class MockEditService implements EditService {
  async proposeEdit(req: EditRequest): Promise<EditResponse> {
    const base = this.compute(req.blockText, req.instruction)
    return req.context?.length ? { ...base, groundedIn: req.context.map((c) => c.source) } : base
  }

  private compute(blockText: string, instruction: string): EditResponse {
    const instr = instruction.trim()

    // replace/fix a name: "change X to Y" / "replace X with Y" / "X should be Y"
    const rep =
      instr.match(/(?:change|replace|fix|rename|swap)\s+["']?(.+?)["']?\s+(?:to|with|->|→|for)\s+["']?(.+?)["']?$/i) ??
      instr.match(/["']?(.+?)["']?\s+should be\s+["']?(.+?)["']?$/i)
    if (rep && rep[1] && rep[2] && blockText.includes(rep[1])) {
      const [, from, to] = rep
      const count = blockText.split(from).length - 1
      return {
        proposedText: blockText.split(from).join(to),
        rationale: `Replaced "${from}" → "${to}" (${count}×). Nothing else changed.`,
        changedEntities: [`${from}→${to}`],
      }
    }

    if (/tighten|shorten|concise|trim|cut|condense/i.test(instr)) {
      const tightened = blockText
        .replace(FILLER, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .trim()
      return {
        proposedText: cap(tightened),
        rationale: 'Tightened: removed filler words; kept all names, figures, and claims.',
        changedEntities: [],
      }
    }

    if (/formal|professional|polish/i.test(instr)) {
      const formal = blockText
        .replace(/\bdon't\b/gi, 'do not')
        .replace(/\bcan't\b/gi, 'cannot')
        .replace(/\bwe're\b/gi, 'we are')
        .replace(/\bit's\b/gi, 'it is')
        .replace(/and Selection Committee,/, 'and Members of the Selection Committee,')
      return { proposedText: formal, rationale: 'Formalized phrasing (expanded contractions); preserved all names.', changedEntities: [] }
    }

    // generic — light cleanup, visibly non-trivial but safe
    return { proposedText: cap(blockText.replace(/\s+/g, ' ').trim()), rationale: 'Light cleanup; no facts changed.', changedEntities: [] }
  }
}

// Turn the model's raw reply into an EditResponse. Pure + exported so it's unit-testable.
// The cardinal rule: NEVER pass conversational prose off as a proposed paragraph. If we
// can't read back a clean, changed paragraph, we surface a clarification instead of a diff.
export function parseEditResponse(text: string, blockText: string): EditResponse {
  const ask = (q: string): EditResponse => ({ proposedText: '', rationale: '', changedEntities: [], clarification: q })
  const VAGUE = "I couldn't read a clean edit back from that. Try being more specific about what to change."

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text)
  } catch {
    return ask(VAGUE)
  }

  const proposedText = typeof parsed.proposedText === 'string' ? parsed.proposedText : ''
  const clarification = typeof parsed.clarification === 'string' ? parsed.clarification.trim() : ''

  // No usable rewrite (empty, or identical to the source) → ask, don't diff.
  if (!proposedText.trim() || proposedText.trim() === blockText.trim()) {
    return ask(clarification || VAGUE)
  }
  // Model returned a real edit AND a question — prefer the edit, drop the chatter.
  return {
    proposedText,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    changedEntities: Array.isArray(parsed.changedEntities)
      ? parsed.changedEntities.filter((e): e is string => typeof e === 'string')
      : [],
    ...(Array.isArray(parsed.groundedIn)
      ? { groundedIn: parsed.groundedIn.filter((s: unknown): s is string => typeof s === 'string') }
      : {}),
  }
}

// Real AI via the Buoyant proxy. Same interface — flips on when the token is set.
export class ProxyEditService implements EditService {
  private client: Anthropic
  private model: string
  constructor(token: string, opts: { baseURL?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: token, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) })
    this.model = opts.model ?? process.env.BUOYANT_MODEL ?? 'claude-sonnet-4-6'
  }
  async proposeEdit({ blockText, instruction, context }: EditRequest): Promise<EditResponse> {
    const grounded = !!context?.length
    const pastWork = grounded
      ? "\n\nPAST WORK (the firm's real past proposals — ground the edit in these where they genuinely fit; do NOT invent):\n" +
        context!.map((c) => `[source: ${c.source}${c.heading ? ` — ${c.heading}` : ''}]\n${c.text}`).join('\n\n')
      : ''
    const system =
      'You revise ONE paragraph of a civil-engineering proposal. Apply only the requested change. ' +
      'Never alter client names, people, license numbers, dates, or figures unless explicitly asked. ' +
      (grounded
        ? 'When you use a fact from PAST WORK, do not invent details, and list the source titles you actually drew from in "groundedIn" (string[], [] if none). '
        : '') +
      'If the instruction is too vague, ambiguous, or unsafe to make a confident single-paragraph edit, ' +
      'do NOT guess and do NOT write any prose into proposedText — instead return ' +
      '{"clarification": "<one short question asking what to change>"} and leave proposedText empty. ' +
      'Otherwise reply with JSON only: {"proposedText": string, "rationale": string, "changedEntities": string[]' +
      (grounded ? ', "groundedIn": string[]' : '') +
      '}.'
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: `Paragraph:\n${blockText}\n\nInstruction: ${instruction}${pastWork}` }],
    })
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    return parseEditResponse(text, blockText)
  }
}

const PROXY_BASE = 'https://hiring-proxy.trybuoyant.ai/anthropic'

// MOCK BY DEFAULT — even with a token in .env — so there is no accidental spend.
// Opt into real Claude explicitly with USE_REAL_AI=true (for demo / submission).
export function getEditService(): EditService {
  if (process.env.USE_REAL_AI !== 'true' && process.env.USE_REAL_AI !== '1') return new MockEditService()
  const own = process.env.ANTHROPIC_API_KEY
  if (own) return new ProxyEditService(own) // your key → api.anthropic.com
  const proxy = process.env.BUOYANT_PROXY_TOKEN
  if (proxy) return new ProxyEditService(proxy, { baseURL: PROXY_BASE })
  return new MockEditService()
}
