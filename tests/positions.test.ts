import { describe, expect, it } from 'vitest'
import type { Node } from 'prosemirror-model'
import { markdownParser } from '../src/index'
import { buildCharMap, lastInlinePos, posToTextOffset, textOffsetToPos } from '../src/positions'

function parse(markdown: string): Node {
  const doc = markdownParser.parse(markdown)
  if (!doc) throw new Error('failed to parse: ' + markdown)
  return doc
}

describe('buildCharMap', () => {
  it('maps every text character in order', () => {
    const map = buildCharMap(parse('hello'))
    expect(map.length).toBe(5)
    expect(map.chars.map((c) => c.offset)).toEqual([0, 1, 2, 3, 4])
    expect(map.chars.map((c) => c.pos)).toEqual([1, 2, 3, 4, 5])
  })

  it('counts a block boundary as a newline character', () => {
    const map = buildCharMap(parse('a\n\nb'))
    expect(map.length).toBe(3)
    expect(map.chars.map((c) => c.offset)).toEqual([0, 1, 2])
    // The newline separator is anchored at the second block's boundary.
    expect(map.chars[1].pos).toBe(3)
  })

  it('counts an atom node as a single character', () => {
    const map = buildCharMap(parse('![alt](https://example.com/a.png)'))
    expect(map.length).toBe(1)
  })

  it('mixes atoms and block boundaries with text', () => {
    const map = buildCharMap(parse('aa\n\n![alt](https://example.com/a.png)\n\nbb'))
    // 'aa' (2) + newline + image (1) + newline + 'bb' (2)
    expect(map.length).toBe(7)
  })
})

describe('textOffsetToPos', () => {
  it('maps offsets to positions in a single paragraph', () => {
    const doc = parse('hello')
    expect(textOffsetToPos(doc, 0)).toBe(1)
    expect(textOffsetToPos(doc, 2)).toBe(3)
    expect(textOffsetToPos(doc, 4)).toBe(5)
  })

  it('clamps offsets before the document to the first position', () => {
    expect(textOffsetToPos(parse('hi'), -5)).toBe(1)
  })

  it('clamps offsets past the end to the last inline position', () => {
    const doc = parse('hi')
    expect(textOffsetToPos(doc, 99)).toBe(lastInlinePos(doc))
    expect(lastInlinePos(doc)).toBe(3)
  })

  it('lands on the newline separator at a block boundary', () => {
    const doc = parse('a\n\nb')
    expect(textOffsetToPos(doc, 1)).toBe(3)
  })

  it('lands on an atom for the offset after its preceding text', () => {
    const doc = parse('aa\n\n![alt](https://example.com/a.png)')
    // offset 3 is the image atom (after 'aa' + newline).
    expect(textOffsetToPos(doc, 3)).toBe(4)
  })

  it('returns a valid last position when the document ends in a block image', () => {
    const doc = parse('aa\n\n![alt](https://example.com/a.png)')
    expect(lastInlinePos(doc)).toBe(3)
    expect(textOffsetToPos(doc, 3)).toBe(4)
    expect(textOffsetToPos(doc, 99)).toBe(3)
  })
})

describe('posToTextOffset', () => {
  it('inverts textOffsetToPos over a simple document', () => {
    const doc = parse('one\n\ntwo')
    for (let offset = 0; offset < 7; offset++) {
      expect(posToTextOffset(doc, textOffsetToPos(doc, offset))).toBe(offset)
    }
  })

  it('maps the start of a following block to the newline offset', () => {
    const doc = parse('one\n\ntwo')
    expect(posToTextOffset(doc, 5)).toBe(3)
    expect(posToTextOffset(doc, 6)).toBe(4)
  })

  it('returns 0 for a position before the first character', () => {
    expect(posToTextOffset(parse('hi'), 0)).toBe(0)
  })
})
