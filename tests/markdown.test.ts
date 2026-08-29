import { describe, expect, it } from 'vitest'
import { markdownParser, markdownSerializer } from '../src/index'

function roundTrip(markdown: string): string {
  const doc = markdownParser.parse(markdown)
  if (!doc) return ''
  return markdownSerializer.serialize(doc).replace(/\n$/, '')
}

describe('markdown scope (Trix-limited)', () => {
  it('parses heading levels as H2 or H3', () => {
    for (let level = 1; level <= 2; level++) {
      expect(roundTrip(`${'#'.repeat(level)} Title`)).toBe('## Title')
    }
    for (let level = 3; level <= 6; level++) {
      expect(roundTrip(`${'#'.repeat(level)} Title`)).toBe('### Title')
    }
  })

  it('round-trips inline emphasis', () => {
    expect(roundTrip('**bold**')).toBe('**bold**')
    expect(roundTrip('*italic*')).toBe('*italic*')
    expect(roundTrip('~~strike~~')).toBe('~~strike~~')
    expect(roundTrip('`code`')).toBe('`code`')
    expect(roundTrip('**bold *nested***')).toBe('**bold *nested***')
  })

  it('round-trips inline spoilers', () => {
    expect(roundTrip('||hidden||')).toBe('||hidden||')
    expect(roundTrip('some ||hidden|| text')).toBe('some ||hidden|| text')
    // Marks nest in schema declaration order, so bold wraps the spoiler.
    expect(roundTrip('||**bold hidden**||')).toBe('**||bold hidden||**')
  })

  it('keeps lone pipes as literal text', () => {
    expect(roundTrip('a | b')).toBe('a | b')
    expect(roundTrip('a || b')).toBe('a || b')
  })

  it('round-trips lists', () => {
    expect(roundTrip('- one\n- two')).toBe('* one\n* two')
    expect(roundTrip('1. one\n2. two')).toBe('1. one\n2. two')
  })

  it('round-trips blockquotes', () => {
    expect(roundTrip('> quoted')).toBe('> quoted')
  })

  it('flattens non-paragraph content inside a blockquote to paragraphs', () => {
    expect(roundTrip('> # heading')).toBe('> heading')
    expect(roundTrip('> > nested')).toBe('> nested')
    expect(roundTrip('> - one\n> - two')).toBe('> one\n>\n> two')
    expect(roundTrip('> ```\n> code\n> ```')).toBe('> code')
  })

  it('round-trips fenced code blocks with language', () => {
    expect(roundTrip('```js\nconst x = 1\n```')).toBe('```js\nconst x = 1\n```')
  })

  it('round-trips links', () => {
    expect(roundTrip('[text](https://example.com)')).toBe('[text](https://example.com)')
  })

  it('round-trips images as attachments', () => {
    expect(roundTrip('![alt](https://example.com/a.png)')).toBe('![alt](https://example.com/a.png)')
  })

  it('treats images as block nodes split out of paragraphs', () => {
    const doc = markdownParser.parse('before ![alt](https://example.com/a.png) after')
    const types = (doc?.toJSON() as { content?: { type: string }[] }).content?.map((c) => c.type)
    expect(types).toEqual(['paragraph', 'image', 'paragraph'])
    expect(markdownSerializer.serialize(doc as never).replace(/\n$/, '')).toBe('before\n\n![alt](https://example.com/a.png)\n\nafter')
  })

  it('escapes markdown special characters in plain text', () => {
    expect(roundTrip('a \\* literal star')).toBe('a \\* literal star')
  })

  it('treats inline HTML as literal text', () => {
    const doc = markdownParser.parse('<b>raw</b>')
    expect(doc?.textContent).toBe('<b>raw</b>')
  })

  it('round-trips horizontal rules', () => {
    expect(roundTrip('---')).toBe('---')
    expect(roundTrip('***')).toBe('---')
  })

  it('round-trips code blocks without a language', () => {
    expect(roundTrip('```\nfoo\n```')).toBe('```\nfoo\n```')
  })

  it('round-trips loose lists with blank lines', () => {
    expect(roundTrip('- one\n\n- two')).toBe('* one\n\n* two')
  })

  it('round-trips nested lists', () => {
    expect(roundTrip('- one\n  - sub')).toBe('* one\n  * sub')
  })

  it('keeps an image inside a list item as a block', () => {
    expect(roundTrip('- ![alt](https://example.com/a.png)')).toBe('* ![alt](https://example.com/a.png)')
  })

  it('degrades an image inside a blockquote to its alt text', () => {
    expect(roundTrip('> ![alt](https://example.com/a.png)')).toBe('> alt')
  })

  it('preserves a link title', () => {
    expect(roundTrip('[text](https://example.com "Title")')).toBe('[text](https://example.com "Title")')
  })

  it('preserves parentheses inside a link URL', () => {
    const doc = markdownParser.parse('[text](https://example.com/a_(b).png)')
    const text = doc?.child(0).child(0)
    expect(text?.marks[0]?.type.name).toBe('link')
    expect(text?.marks[0]?.attrs.href).toBe('https://example.com/a_(b).png')
  })
})
