import Anthropic from '@anthropic-ai/sdk'

export interface EditRequest {
  blockText: string
  instruction: string
}
export interface EditResponse {
  proposedText: string
  rationale: string
  changedEntities: string[] // entities the edit intentionally changed; [] = none (faithfulness)
}
export interface EditService {
  proposeEdit(req: EditRequest): Promise<EditResponse>
}

const FILLER = /\b(really|very|quite|just|actually|basically|simply)\b/gi
const cap = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s)

// Deterministic, token-free. Drives the whole loop before the proxy token lands.
export class MockEditService implements EditService {
  async proposeEdit({ blockText, instruction }: EditRequest): Promise<EditResponse> {
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

// Real AI via the Buoyant proxy. Same interface — flips on when the token is set.
export class ProxyEditService implements EditService {
  private client: Anthropic
  private model: string
  constructor(token: string, opts: { baseURL?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: token, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) })
    this.model = opts.model ?? process.env.BUOYANT_MODEL ?? 'claude-sonnet-4-6'
  }
  async proposeEdit({ blockText, instruction }: EditRequest): Promise<EditResponse> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system:
        'You revise ONE paragraph of a civil-engineering proposal. Apply only the requested change. ' +
        'Never alter client names, people, license numbers, dates, or figures unless explicitly asked. ' +
        'Reply with JSON only: {"proposedText": string, "rationale": string, "changedEntities": string[]}.',
      messages: [{ role: 'user', content: `Paragraph:\n${blockText}\n\nInstruction: ${instruction}` }],
    })
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    try {
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text)
      return {
        proposedText: parsed.proposedText ?? blockText,
        rationale: parsed.rationale ?? '',
        changedEntities: Array.isArray(parsed.changedEntities) ? parsed.changedEntities : [],
      }
    } catch {
      return { proposedText: text.trim() || blockText, rationale: 'AI edit', changedEntities: [] }
    }
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
