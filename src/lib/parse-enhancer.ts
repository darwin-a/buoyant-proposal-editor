import Anthropic from '@anthropic-ai/sdk'
import type { Block, LockedField, ParsedDoc } from './parse'

// The AI parse layer. Deterministic parse always runs first; this OPTIONALLY enriches
// the SEMANTIC bits regex can't catch (claims like "40th anniversary", grouped entity
// variants) and can re-segment messy/unseen layouts. Mock = no-op (token-free).
export interface EnhanceResult {
  lockedFields: LockedField[]
  blocks?: Block[]
}
export interface ParseEnhancer {
  enhance(parsed: ParsedDoc): Promise<EnhanceResult>
}

// No-op: returns the deterministic result unchanged. Used until the token lands.
export class MockParseEnhancer implements ParseEnhancer {
  async enhance(parsed: ParsedDoc): Promise<EnhanceResult> {
    return { lockedFields: parsed.lockedFields }
  }
}

// Real AI via the proxy. Asks for the semantic immutables the deterministic pass misses.
// NOTE: callers must CACHE this (by file hash + model version) — it is slow/costly.
export class ProxyParseEnhancer implements ParseEnhancer {
  private client: Anthropic
  private model: string
  constructor(token: string, model = process.env.BUOYANT_MODEL ?? 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey: token, baseURL: 'https://hiring-proxy.trybuoyant.ai/anthropic' })
    this.model = model
  }
  async enhance(parsed: ParsedDoc): Promise<EnhanceResult> {
    const text = parsed.blocks.map((b) => b.text).join('\n')
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system:
        'Extract the IMMUTABLE facts a proposal must never misstate: client, recipient, firm, ' +
        'project numbers, people + license numbers, dates, and quantitative claims (e.g. "40th ' +
        'anniversary", "60 professionals"). Group name variants. Reply JSON only: ' +
        '{"lockedFields":[{"label":string,"value":string}]}.',
      messages: [{ role: 'user', content: text.slice(0, 12000) }],
    })
    const out = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    try {
      const parsedOut = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out)
      // merge AI fields with the deterministic ones (dedupe by label+value)
      const merged = [...parsed.lockedFields]
      for (const f of parsedOut.lockedFields ?? []) {
        if (f?.value && !merged.some((m) => m.label === f.label && m.value === f.value)) merged.push(f)
      }
      return { lockedFields: merged }
    } catch {
      return { lockedFields: parsed.lockedFields }
    }
  }
}

export function getParseEnhancer(): ParseEnhancer {
  const token = process.env.BUOYANT_PROXY_TOKEN
  return token ? new ProxyParseEnhancer(token) : new MockParseEnhancer()
}
