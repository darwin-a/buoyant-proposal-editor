import { describe, it, expect } from 'vitest'
import { dedup, recoverBlocks, detectImmutables, collapseShadows, type Line } from './parse'
import { validateParsedDoc } from './doc'

// y decreases in reading order (top of page first)
const L = (text: string, y: number, height = 12, x = 60): Line => ({ text, x, y, height })

describe('collapseShadows', () => {
  it('collapses same text drawn at overlapping x (shadow copies) to one', () => {
    const runs = [
      { str: 'Statement of', x: 125, width: 300 },
      { str: 'Statement of', x: 127, width: 300 },
      { str: 'Statement of', x: 123, width: 300 },
    ]
    expect(collapseShadows(runs).map((r) => r.str)).toEqual(['Statement of'])
  })
  it('keeps the same text when it is genuinely spaced apart (not a shadow)', () => {
    const runs = [
      { str: 'Land', x: 76, width: 30 },
      { str: 'Land', x: 301, width: 30 }, // a real second column, far away
    ]
    expect(collapseShadows(runs)).toHaveLength(2)
  })
  it('keeps distinct adjacent words', () => {
    const runs = [
      { str: 'Who We', x: 82, width: 100 },
      { str: 'Who We', x: 84, width: 100 }, // shadow
      { str: 'Are', x: 200, width: 50 },
    ]
    expect(collapseShadows(runs).map((r) => r.str)).toEqual(['Who We', 'Are'])
  })
})

describe('dedup', () => {
  it('removes shadow-layered duplicate lines at near-same y', () => {
    const lines = [L('OUR FIRM', 700), L('OUR FIRM', 698), L('OUR FIRM', 696), L('Body text.', 680)]
    expect(dedup(lines).map((l) => l.text)).toEqual(['OUR FIRM', 'Body text.'])
  })
  it('keeps identical text that is far apart', () => {
    expect(dedup([L('SERVICES', 700), L('SERVICES', 300)])).toHaveLength(2)
  })
})

describe('recoverBlocks', () => {
  it('detects an all-caps short line as a heading', () => {
    const blocks = recoverBlocks([L('OUR FIRM', 700), L('MECO is a firm.', 684)])
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'OUR FIRM' })
    expect(blocks[1]).toMatchObject({ type: 'paragraph', text: 'MECO is a firm.' })
  })
  it('joins consecutive body lines into one paragraph', () => {
    const blocks = recoverBlocks([L('We are a civil', 700), L('engineering firm.', 686)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('We are a civil engineering firm.')
  })
  it('splits paragraphs across a large vertical gap', () => {
    expect(recoverBlocks([L('First para.', 700), L('Second para.', 600)])).toHaveLength(2)
  })
  it('treats a large-font short line as a heading (relative to body)', () => {
    const blocks = recoverBlocks([L('Thank You', 700, 40), L('Body sentence one.', 650, 12), L('Body sentence two.', 636, 12)])
    expect(blocks.find((b) => b.text === 'Thank You')?.type).toBe('heading')
  })
  it('assigns unique block ids', () => {
    const ids = recoverBlocks([L('OUR FIRM', 700), L('Body.', 684)]).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('merges a wrapped multi-line heading (same size, adjacent) into one', () => {
    const blocks = recoverBlocks([
      L('Statement of', 1000, 40),
      L('Qualifications', 950, 40),
      L('Body one here.', 900, 12),
      L('Body two here.', 884, 12),
      L('Body three here.', 868, 12),
    ])
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Statement of Qualifications' })
  })
  it('does not merge headings of different sizes', () => {
    const blocks = recoverBlocks([
      L('Big Title', 1000, 40),
      L('Smaller Subtitle', 958, 24),
      L('Body one.', 920, 12),
      L('Body two.', 904, 12),
      L('Body three.', 888, 12),
    ])
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toEqual(['Big Title', 'Smaller Subtitle'])
  })
})

describe('detectImmutables', () => {
  const text = [
    'April 14, 2025',
    'Project No. 041-560',
    'ATTN: Mary Wiles, Mayor',
    'MECO Engineering Company, Inc. (MECO) is pleased to present qualifications to the City of Dixon, MO',
    '573-893-5558  djenkins@mecoengineering.com',
    'Donald J. Jenkins, PE  MO PE No. PE-2020000059',
  ].join('\n')

  it('extracts the client', () => {
    expect(detectImmutables(text)).toContainEqual({ label: 'Client', value: 'Dixon' })
  })
  it('extracts project number, date, firm, phone, email', () => {
    const f = detectImmutables(text)
    expect(f).toContainEqual({ label: 'Project No.', value: '041-560' })
    expect(f).toContainEqual({ label: 'Date', value: 'April 14, 2025' })
    expect(f).toContainEqual({ label: 'Firm', value: 'MECO Engineering Company, Inc.' })
    expect(f).toContainEqual({ label: 'Phone', value: '573-893-5558' })
    expect(f).toContainEqual({ label: 'Email', value: 'djenkins@mecoengineering.com' })
  })
  it('extracts a PE name and license', () => {
    const f = detectImmutables(text)
    expect(f).toContainEqual({ label: 'Engineer (PE)', value: 'Donald J. Jenkins' })
    expect(f).toContainEqual({ label: 'PE license', value: 'PE-2020000059' })
  })
})

describe('validateParsedDoc', () => {
  const good = {
    title: 'Statement of Qualifications — City of Dixon',
    blocks: [
      { id: 'b-0', type: 'heading', text: 'OUR FIRM', level: 2 },
      { id: 'b-1', type: 'paragraph', text: 'MECO is a firm.' },
    ],
    lockedFields: [{ label: 'Client', value: 'Dixon' }],
  }

  it('accepts a well-formed parsed doc and returns a clean copy', () => {
    const out = validateParsedDoc(good)
    expect(out).not.toBeNull()
    expect(out!.title).toBe(good.title)
    expect(out!.blocks).toHaveLength(2)
    expect(out!.lockedFields).toEqual([{ label: 'Client', value: 'Dixon' }])
  })

  it('rejects non-objects', () => {
    expect(validateParsedDoc(null)).toBeNull()
    expect(validateParsedDoc('nope')).toBeNull()
    expect(validateParsedDoc(42)).toBeNull()
  })

  it('rejects when blocks is missing or not an array', () => {
    expect(validateParsedDoc({ title: 'x', lockedFields: [] })).toBeNull()
    expect(validateParsedDoc({ title: 'x', blocks: {}, lockedFields: [] })).toBeNull()
  })

  it('rejects a doc with zero usable blocks', () => {
    expect(validateParsedDoc({ title: 'x', blocks: [{ type: 'paragraph' }], lockedFields: [] })).toBeNull()
  })

  it('drops malformed blocks but keeps the valid ones', () => {
    const out = validateParsedDoc({
      title: 'x',
      blocks: [
        { id: 'b-0', type: 'paragraph', text: 'keep me' },
        { id: 'b-1', type: 'banana', text: 'bad type' },
        { id: 'b-2', type: 'heading' }, // no text
        { text: 'no type either' },
      ],
      lockedFields: [],
    })
    expect(out!.blocks).toHaveLength(1)
    expect(out!.blocks[0].text).toBe('keep me')
  })

  it('drops locked fields that are not label/value string pairs', () => {
    const out = validateParsedDoc({
      ...good,
      lockedFields: [{ label: 'Client', value: 'Dixon' }, { label: 'x' }, 'junk', { label: 1, value: 2 }],
    })
    expect(out!.lockedFields).toEqual([{ label: 'Client', value: 'Dixon' }])
  })

  it('falls back to a string title when title is missing', () => {
    const out = validateParsedDoc({ blocks: good.blocks, lockedFields: [] })
    expect(typeof out!.title).toBe('string')
    expect(out!.title.length).toBeGreaterThan(0)
  })
})
