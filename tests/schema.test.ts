import { describe, expect, it } from 'vitest'
import { Attachment, Editor } from '../src/index'

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

  it('places an image inside a list item', () => {
    const editor = makeEditor()
    editor.loadHTML('<ul><li><img src="x.png" alt="a"></li></ul>')
    const item = editor.getDocument().child(0).child(0)
    expect(item.child(0).type.name).toBe('image')
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
})
