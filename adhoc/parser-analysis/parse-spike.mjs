// Ad-hoc spike: pure-JS PDF → blocks → immutable fields, on the real easy.pdf.
// Goal: SEE how parsing goes and whether deterministic structure-recovery +
// immutable-field detection actually work, before writing the real lib/parse.ts.
//
// Run: node adhoc/parser-analysis/parse-spike.mjs [path-to-pdf]

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'

const path = process.argv[2] || 'docs/ExampleProposals/proposals/easy.pdf'
const data = new Uint8Array(readFileSync(path))

// ---------- 1. EXTRACT: text + geometry, line by line ----------
async function extractLines(data) {
  const doc = await getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const fontFamily = content.styles // { fontName: { fontFamily, ... } }

    // bucket items into lines by rounded y
    const byY = new Map()
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue
      const y = Math.round(it.transform[5])
      const x = Math.round(it.transform[4])
      const height = Math.round(Math.abs(it.transform[3]) || it.height || 0)
      const fam = fontFamily[it.fontName]?.fontFamily || it.fontName || ''
      const b = byY.get(y) || { y, items: [] }
      b.items.push({ x, str: it.str, height, fam })
      byY.set(y, b)
    }
    const lines = [...byY.values()]
      .sort((a, b) => b.y - a.y) // top → bottom
      .map((l) => {
        const items = l.items.sort((a, b) => a.x - b.x)
        return {
          y: l.y,
          x: items[0].x,
          text: items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
          height: Math.max(...items.map((i) => i.height)),
          fam: items[0].fam,
        }
      })
      .filter((l) => l.text)
    pages.push({ page: p, lines })
  }
  return pages
}

// ---------- 2. DEDUP shadow-layered text (Canva outline effect) ----------
// Identical text at near-identical y appears 2-3x. Collapse runs of dup text.
function dedup(lines) {
  const out = []
  for (const l of lines) {
    const prev = out[out.length - 1]
    if (prev && prev.text === l.text && Math.abs(prev.y - l.y) < 6) continue
    out.push(l)
  }
  return out
}

// ---------- 3. RECOVER blocks: headings + paragraphs ----------
const isAllCaps = (t) => /[A-Z]/.test(t) && t === t.toUpperCase()
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 0 }

function recoverBlocks(lines, docId = 'doc') {
  const body = median(lines.map((l) => l.height))
  const blocks = []
  let buf = []
  let n = 0
  const flush = () => {
    if (!buf.length) return
    blocks.push({ id: `${docId}-b${n++}`, type: 'paragraph', text: buf.join(' ').replace(/\s+/g, ' ').trim() })
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const short = l.text.length <= 60
    const bigGap = i > 0 ? Math.abs(lines[i - 1].y - l.y) > body * 1.8 : false
    // section heading: short + ALL CAPS (reliable signal for these SOQ headers)
    const sectionHeading = short && isAllCaps(l.text)
    // display/decorative: much larger font (cover/marketing pages)
    const display = l.height >= body * 1.6
    if (bigGap) flush()
    if (sectionHeading) { flush(); blocks.push({ id: `${docId}-b${n++}`, type: 'heading', text: l.text, signal: 'caps+short' }) }
    else if (display) { flush(); blocks.push({ id: `${docId}-b${n++}`, type: 'display', text: l.text, signal: `size ${l.height}` }) }
    else buf.push(l.text)
  }
  flush()
  return { body, blocks }
}

// ---------- 4. IMMUTABLE fields: deterministic regex (NO AI) ----------
function detectImmutables(fullText) {
  const found = []
  const add = (label, value) => { if (value && !found.some((f) => f.label === label && f.value === value)) found.push({ label, value: value.trim() }) }
  const m = (re) => { const x = fullText.match(re); return x ? x[1] : null }
  const all = (re) => [...fullText.matchAll(re)].map((x) => x[1])

  add('Project No.', m(/Project No\.?\s*([0-9][0-9-]+)/i))
  add('Date', m(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})\b/))
  add('Client', m(/qualifications to the City of\s+([A-Z][a-zA-Z]+)/) || m(/City of\s+([A-Z][a-zA-Z]+)/))
  add('Recipient (ATTN)', m(/ATTN:\s*([^\n|]+?)(?:\s{2,}|$)/i))
  add('Salutation', m(/Dear\s+([^,\n]+),/))
  add('Firm', m(/(MECO Engineering Company, Inc\.)/))
  for (const ph of all(/\b(\d{3}-\d{3}-\d{4})\b/g)) add('Phone', ph)
  for (const em of all(/\b([\w.]+@[\w.]+\.\w+)\b/g)) add('Email', em)
  for (const lic of all(/MO PE\s+(?:No\.?\s*)?([A-Z]?-?[0-9]{5,})/g)) add('PE license', lic)
  for (const name of all(/\b([A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+), PE\b/g)) add('Engineer (PE)', name)
  return found
}

// ---------- run ----------
const pages = await extractLines(data)
console.log(`PDF: ${path}  ·  ${pages.length} pages\n`)

// Show the prose pages (2-4) end-to-end so we can eyeball the recovery
for (const { page, lines } of pages.filter((p) => p.page >= 2 && p.page <= 3)) {
  const deduped = dedup(lines)
  console.log(`\n================ PAGE ${page} ================`)
  console.log(`raw lines: ${lines.length}  →  after dedup: ${deduped.length}`)
  const { body, blocks } = recoverBlocks(deduped, `p${page}`)
  console.log(`body font height ≈ ${body}`)
  console.log(`\n--- recovered blocks ---`)
  for (const b of blocks) {
    const tag = b.type === 'heading' ? `## [${b.signal}]` : b.type === 'display' ? `~~ [${b.signal}]` : '   '
    console.log(`${tag} ${b.text.slice(0, 92)}`)
  }
}

// Immutable fields across the whole document
const fullText = pages.flatMap((p) => p.lines.map((l) => l.text)).join('\n')
console.log(`\n\n================ IMMUTABLE FIELDS (deterministic, no AI) ================`)
for (const f of detectImmutables(fullText)) console.log(`  🔒 ${f.label.padEnd(18)} ${f.value}`)
