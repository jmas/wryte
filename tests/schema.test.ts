import { describe, expect, it } from 'vitest'
import { Attachment, Editor } from '../src/index'
import { isPreviewable } from '../src/schema'

function makeEditor(value = ''): Editor {
  const element = document.createElement('div')
  return new Editor(element, { value, toolbar: false, contextMenu: false })
}

describe('block images', () => {
  it('lifts a link-wrapped image out of the paragraph and link', () => {
    const editor = makeEditor()
    editor.loadHTML('<p><a href="https://example.com/"><img src="https://example.com/x.png" alt="alt"></a></p>')
    const doc = editor.getDocument()
    expect(doc.childCount).toBe(1)
    const img = doc.child(0)
    expect(img.type.name).toBe('image')
    expect(img.marks.length).toBe(0)
    expect(img.attrs.url).toBe('https://example.com/x.png')
    expect(editor.toHTML()).toBe('<img src="https://example.com/x.png" alt="alt" data-wryte-attachment="">')
  })

  it('keeps image-free paragraphs intact and splits around images', () => {
    const cases: [string, string][] = [
      ['<p>text <img src="x.png" alt="a"></p>', 'paragraph(text),image'],
      ['<p><img src="x.png" alt="a"> text</p>', 'image,paragraph(text)'],
      ['<p>a <img src="x.png" alt="a"> b</p>', 'paragraph(text),image,paragraph(text)'],
      ['<p>just text</p>', 'paragraph(text)'],
    ]
    for (const [html, expected] of cases) {
      const editor = makeEditor()
      editor.loadHTML(html)
      const types = (editor.getDocument().toJSON() as { content?: { type: string; content?: { type: string }[] }[] })
        .content?.map((c) => c.type + (c.content ? '(' + c.content.map((x) => x.type).join('|') + ')' : ''))
        .join(',')
      expect(types).toBe(expected)
    }
  })

  it('lifts an image out of a list item', () => {
    const editor = makeEditor()
    editor.loadHTML('<ul><li><img src="x.png" alt="a"></li></ul>')
    const doc = editor.getDocument()
    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('image')
    expect(editor.toMarkdown()).toBe('![a](x.png)')
  })

  it('keeps text in a list item while lifting a block image out', () => {
    const editor = makeEditor()
    editor.loadHTML('<ul><li>text <img src="x.png" alt="a"></li></ul>')
    const doc = editor.getDocument()
    const item = doc.child(0).child(0)
    expect(item.type.name).toBe('list_item')
    expect(item.child(0).textContent).toBe('text')
    expect(doc.child(1).type.name).toBe('image')
  })

  it('inserts a previewable attachment as a block image', () => {
    const editor = makeEditor('aaa bbb')
    editor.setSelectedRange([3, 3])
    editor.insertAttachments([
      new Attachment({ id: 'x', url: 'https://e.com/a.png', alt: 'a', contentType: 'image/png' }),
    ])
    const types = (editor.getDocument().toJSON() as { content?: { type: string }[] }).content?.map((c) => c.type)
    expect(types).toEqual(['paragraph', 'image', 'paragraph'])
    expect(editor.getDocument().textContent).toBe('aaa bbb')
  })

  it('keeps a non-previewable attachment inline in the paragraph', () => {
    const editor = makeEditor('aaa bbb')
    editor.setSelectedRange([3, 3])
    editor.insertAttachments([
      new Attachment({ id: 'y', url: 'https://e.com/a.pdf', filename: 'a.pdf', contentType: 'application/pdf' }),
    ])
    const types = (editor.getDocument().toJSON() as { content?: { type: string }[] }).content?.map((c) => c.type)
    expect(types).toEqual(['paragraph'])
  })

  it('lifts a block image out of a list when inserting', () => {
    const editor = makeEditor('- one\n- two')
    editor.setSelectedRange([1, 1])
    editor.insertAttachments([
      new Attachment({ id: 'x', url: 'https://e.com/a.png', alt: 'a', contentType: 'image/png' }),
    ])
    const types = (editor.getDocument().toJSON() as { content?: { type: string }[] }).content?.map((c) => c.type)
    expect(types).toEqual(['bullet_list', 'image'])
    expect(editor.toMarkdown()).toBe('* one\n* two\n\n![a](https://e.com/a.png)')
  })

  it('keeps an inline attachment inside a list item', () => {
    const editor = makeEditor('- one')
    editor.setSelectedRange([1, 1])
    editor.insertAttachments([
      new Attachment({ id: 'y', url: 'https://e.com/a.pdf', filename: 'a.pdf', contentType: 'application/pdf' }),
    ])
    const item = editor.getDocument().child(0).child(0)
    expect(item.child(0).type.name).toBe('paragraph')
    expect(item.child(0).childCount).toBeGreaterThan(1)
  })
})

describe('schema DOM round-trips', () => {
  it('clamps HTML headings to H2 and H3', () => {
    const cases: [string, string][] = [
      ['<h1>t</h1>', '<h2>t</h2>'],
      ['<h2>t</h2>', '<h2>t</h2>'],
      ['<h3>t</h3>', '<h3>t</h3>'],
      ['<h4>t</h4>', '<h3>t</h3>'],
      ['<h6>t</h6>', '<h3>t</h3>'],
    ]
    for (const [html, expected] of cases) {
      const editor = makeEditor()
      editor.loadHTML(html)
      expect(editor.toHTML()).toBe(expected)
    }
  })

  it('round-trips a horizontal rule', () => {
    const editor = makeEditor()
    editor.loadHTML('<hr>')
    expect(editor.toHTML()).toBe('<hr>')
    expect(editor.toMarkdown()).toBe('---')
  })

  it('round-trips an inline attachment through a span', () => {
    const editor = makeEditor()
    editor.loadHTML('<p>see <span data-wryte-attachment="a1" data-wryte-url="https://e.com/a.pdf">a.pdf</span></p>')
    const span = editor.element.querySelector('span[data-wryte-attachment]')
    expect(span).not.toBeNull()
    // The id is a per-editor concern and does not survive HTML parsing; the
    // URL and filename do.
    const html = editor.toHTML()
    expect(html).toContain('data-wryte-url="https://e.com/a.pdf"')
    expect(html).toContain('title="a.pdf"')
  })

  it('parses a link mark with its href and title', () => {
    const editor = makeEditor()
    editor.loadHTML('<p><a href="https://e.com" title="The site">text</a></p>')
    expect(editor.toMarkdown()).toBe('[text](https://e.com "The site")')
  })
})

describe('isPreviewable', () => {
  it('recognizes image content types', () => {
    expect(isPreviewable('image/png')).toBe(true)
    expect(isPreviewable('image/jpeg')).toBe(true)
    expect(isPreviewable('image/gif')).toBe(true)
    expect(isPreviewable('image/webp')).toBe(true)
    expect(isPreviewable('image/*')).toBe(true)
    expect(isPreviewable('image/jpg')).toBe(true)
  })

  it('rejects non-image content types', () => {
    expect(isPreviewable('application/pdf')).toBe(false)
    expect(isPreviewable('text/plain')).toBe(false)
    expect(isPreviewable(null)).toBe(false)
    expect(isPreviewable(undefined as unknown as string)).toBe(false)
  })
})
