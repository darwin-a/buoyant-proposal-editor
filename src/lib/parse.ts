// Pure-JS PDF → structured blocks + immutable fields. Ported from the adhoc spike.
// Deterministic; the AI proxy is only a future fallback for PDFs this mangles (C7).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export type BlockType = 'heading' | 'paragraph'
export interface Block {
  id: string
  type: BlockType
  text: string
  level?: number
}
export interface LockedField {
  label: string
  value: string
}
export interface Line {
  text: string
  x: number
  y: number // global, strictly decreasing in reading order
  height: number
}
export interface ParsedDoc {
  title: string
  blocks: Block[]
  lockedFields: LockedField[]
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const isAllCaps = (t: string) => /[A-Z]/.test(t) && t === t.toUpperCase()

// ---- shadow/overlap dedup ----
// Design tools (Canva) draw outline/drop-shadow effects as the SAME text at near-
// coincident coordinates. Same string + overlapping x = a drawn shadow → keep one.
// Pure geometry, no AI. Generalizes to any shadowed PDF.
export interface Run {
  str: string
  x: number
  width: number
  height?: number
}
export function collapseShadows<T extends Run>(runs: T[]): T[] {
  const placed: T[] = []
  for (const r of [...runs].sort((a, b) => a.x - b.x)) {
    const isShadow = placed.some(
      (p) => p.str === r.str && Math.abs(p.x - r.x) < Math.max(p.width, r.width) * 0.6
    )
    if (!isShadow) placed.push(r)
  }
  return placed
}

// ---- extraction (pdfjs, geometry-aware spacing) ----
export async function extractLines(data: Uint8Array): Promise<Line[]> {
  const doc = await getDocument({ data, useSystemFonts: false }).promise
  const BIG = 1_000_000
  const out: Line[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const byY = new Map<number, { transform: number[]; width: number; height: number; str: string }[]>()
    for (const it of content.items as unknown as { str: string; transform: number[]; width: number; height: number }[]) {
      if (!it.str) continue
      const y = Math.round(it.transform[5])
      const bucket = byY.get(y) ?? []
      bucket.push(it)
      byY.set(y, bucket)
    }
    const pageLines = [...byY.entries()]
      .sort((a, b) => b[0] - a[0]) // top → bottom
      .map(([y, items]) => {
        const runs = items.map((it) => ({
          str: it.str,
          x: it.transform[4],
          width: it.width || 0,
          height: Math.abs(it.transform[3]) || it.height || 10,
        }))
        const kept = collapseShadows(runs) // drop overlapping shadow copies, sorted by x
        let text = ''
        let prevEnd: number | null = null
        let fontH = 0
        for (const r of kept) {
          fontH = Math.max(fontH, r.height)
          if (prevEnd !== null) {
            const gap = r.x - prevEnd
            // space only on a real horizontal gap — avoids "Commit"+"tee" → "Commit tee"
            if (gap > r.height * 0.25 && !text.endsWith(' ') && !r.str.startsWith(' ')) text += ' '
          }
          text += r.str
          prevEnd = r.x + r.width
        }
        return {
          text: text.replace(/\s+/g, ' ').trim(),
          x: kept[0]?.x ?? 0,
          y: (doc.numPages - p) * BIG + y, // global reading order
          height: fontH,
        }
      })
      .filter((l) => l.text.length > 0)
    out.push(...pageLines)
  }
  return out
}

// ---- dedup shadow-layered (Canva outline) text ----
export function dedup(lines: Line[]): Line[] {
  const out: Line[] = []
  for (const l of lines) {
    const prev = out[out.length - 1]
    if (prev && prev.text === l.text && Math.abs(prev.y - l.y) < 8) continue
    out.push(l)
  }
  return out
}

// ---- structure recovery: headings (caps+short or large) + paragraphs by gap ----
export function recoverBlocks(lines: Line[], docId = 'b'): Block[] {
  if (lines.length === 0) return []
  const body = median(lines.map((l) => l.height)) || 12
  const blocks: Block[] = []
  let buf: string[] = []
  let n = 0
  // track the open heading so a wrapped multi-line heading (same size, adjacent) merges
  let openHeading: { block: Block; height: number; y: number } | null = null
  const flushPara = () => {
    if (!buf.length) return
    blocks.push({ id: `${docId}-${n++}`, type: 'paragraph', text: buf.join(' ').replace(/\s+/g, ' ').trim() })
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const short = l.text.length <= 70
    const isHeading = short && (isAllCaps(l.text) || l.height >= body * 1.3)
    const gapBefore = i > 0 ? lines[i - 1].y - l.y : 0
    if (isHeading) {
      flushPara()
      const wraps =
        openHeading &&
        Math.abs(openHeading.height - l.height) < 2 && // same font size
        openHeading.y - l.y < l.height * 1.8 // adjacent (relative to heading size)
      if (wraps && openHeading) {
        openHeading.block.text = `${openHeading.block.text} ${l.text.trim()}`.replace(/\s+/g, ' ').trim()
        openHeading.y = l.y
      } else {
        const level = l.height >= body * 1.8 ? 1 : l.height >= body * 1.3 ? 2 : 3
        const block: Block = { id: `${docId}-${n++}`, type: 'heading', text: l.text.trim(), level }
        blocks.push(block)
        openHeading = { block, height: l.height, y: l.y }
      }
    } else {
      if (i > 0 && gapBefore > body * 1.7) flushPara() // paragraph break (incl. page boundary)
      buf.push(l.text)
      openHeading = null // a body line breaks the heading-merge chain
    }
  }
  flushPara()
  return blocks
}

// ---- deterministic immutable-field detection (no AI) ----
export function detectImmutables(fullText: string): LockedField[] {
  const found: LockedField[] = []
  const add = (label: string, value: string | null | undefined) => {
    if (!value) return
    const v = value.trim()
    if (v && !found.some((f) => f.label === label && f.value === v)) found.push({ label, value: v })
  }
  const m = (re: RegExp) => fullText.match(re)?.[1] ?? null
  const all = (re: RegExp) => [...fullText.matchAll(re)].map((x) => x[1])

  add('Client', m(/qualifications to the City of\s+([A-Z][a-zA-Z]+)/) ?? m(/City of\s+([A-Z][a-zA-Z]+)/))
  add('Project No.', m(/Project No\.?\s*([0-9][0-9-]+)/i))
  add('Recipient', m(/ATTN:\s*([^\n|]+?)(?:\s{2,}|$)/i) ?? m(/Dear\s+([^,\n]+),/))
  add('Date', m(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})\b/))
  add('Firm', m(/(MECO Engineering Company, Inc\.)/))
  for (const ph of all(/\b(\d{3}-\d{3}-\d{4})\b/g)) add('Phone', ph)
  for (const em of all(/\b([\w.]+@[\w.]+\.\w+)\b/g)) add('Email', em)
  for (const lic of all(/MO PE\s+(?:No\.?\s*)?((?:PE-|E-)?[0-9]{5,})/g)) add('PE license', lic)
  for (const name of all(/\b([A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+), PE\b/g)) add('Engineer (PE)', name)
  return found
}

// ---- orchestrator ----
export async function parsePdf(data: Uint8Array, filename: string): Promise<ParsedDoc> {
  const lines = dedup(await extractLines(data))
  const blocks = recoverBlocks(lines)
  const fullText = lines.map((l) => l.text).join('\n')
  const lockedFields = detectImmutables(fullText)
  const client = lockedFields.find((f) => f.label === 'Client')?.value
  const title = client ? `Statement of Qualifications — City of ${client}` : filename.replace(/\.pdf$/i, '')
  return { title, blocks, lockedFields }
}
