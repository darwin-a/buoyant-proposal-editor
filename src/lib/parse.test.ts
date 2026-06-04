import { describe, it, expect } from 'vitest'
import { dedup, recoverBlocks, detectImmutables, type Line } from './parse'

// y decreases in reading order (top of page first)
const L = (text: string, y: number, height = 12, x = 60): Line => ({ text, x, y, height })

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
