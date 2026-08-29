import { describe, expect, it } from 'vitest'
import { NodeSelection } from 'prosemirror-state'
import { Editor } from '../src/index'
import { markdownParser, markdownSerializer } from '../src/index'
import { URL_RE } from '../src/index'
import type { EmbedResult } from '../src/index'

function makeEditor(value = ''): Editor {
  return new Editor(document.createElement('div'), { value, toolbar: false, contextMenu: false })
}

// Simulates the input-rule prop evaluating text typed at the caret, as PM does
// before the characters are inserted.
function applyInputRule(editor: Editor, text: string): void {
  const { from, to } = editor.editorView.state.selection
  editor.editorView.someProp('handleTextInput', (fn) => fn(editor.editorView, from, to, text, () => editor.editorView.state.tr))
}

function embedTypes(editor: Editor): { url: string | null; host: string | null; title: string | null; image: string | null }[] {
  const found: { url: string | null; host: string | null; title: string | null; image: string | null }[] = []
  editor.getDocument().descendants((node) => {
    if (node.type.name === 'embed') {
      found.push({ url: node.attrs.url, host: node.attrs.host, title: node.attrs.title, image: node.attrs.image })
    }
  })
  return found
}

function embedCardDom(editor: Editor): HTMLElement | null {
  return editor.element.querySelector('.wryte-embed')
}

describe('URL matching', () => {
  it('recognizes http(s) URLs and bare domains as embeds', () => {
    for (const url of [
      'https://example.com',
      'http://example.com/path?q=1',
      'https://sub.example.co.uk/x',
      'example.com',
      'www.example.com/path',
    ]) {
      expect(URL_RE.test(url), url).toBe(true)
    }
  })

  it('does not treat ordinary text or version strings as embeds', () => {
    for (const notUrl of ['hello world', '1.5', 'v1.2.3', 'a sentence with a dot.', 'just text', '']) {
      expect(URL_RE.test(notUrl), notUrl).toBe(false)
    }
  })
})

describe('embed insertion', () => {
  it('turns a URL typed on an empty line into an embed card', () => {
    const editor = makeEditor('')
    applyInputRule(editor, 'https://example.com ')
    expect(embedTypes(editor)).toEqual([
      { url: 'https://example.com', host: 'example.com', title: null, image: null },
    ])
    // The caret lands in a fresh paragraph after the card.
    expect(editor.toMarkdown()).toBe('https://example.com')
  })

  it('fires wryte-embed-request and fills the card via respond()', async () => {
    const editor = makeEditor('')
    const requested: string[] = []
    const captured: { respond?: (result: EmbedResult) => void } = {}
    editor.element.addEventListener('wryte-embed-request', (event) => {
      const detail = (event as CustomEvent).detail as { url: string; respond: (r: EmbedResult) => void }
      requested.push(detail.url)
      captured.respond = detail.respond
    })

    applyInputRule(editor, 'https://example.com ')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requested).toEqual(['https://example.com'])
    expect(captured.respond).toBeTypeOf('function')

    const card = embedCardDom(editor)
    expect(card?.querySelector('.wryte-embed-host')?.textContent).toBe('example.com')
    expect(card?.querySelector('.wryte-embed-title')).toBeNull()

    captured.respond?.({ title: 'Example', image: 'https://cdn.example.com/cover.png' })
    expect(embedTypes(editor)).toEqual([
      { url: 'https://example.com', host: 'example.com', title: 'Example', image: 'https://cdn.example.com/cover.png' },
    ])
    const updated = embedCardDom(editor)
    const img = updated?.querySelector('img.wryte-embed-image')
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/cover.png')
    const body = updated?.querySelector('.wryte-embed-body')
    expect(body?.querySelector('.wryte-embed-title')?.textContent).toBe('Example')
    expect(body?.querySelector('.wryte-embed-host')?.textContent).toBe('example.com')
    // Image on the left, text block to its right.
    expect(img && body ? (img.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false).toBe(true)
    // Host sits below the title.
    const title = updated?.querySelector('.wryte-embed-title')
    const host = updated?.querySelector('.wryte-embed-host')
    expect(title && host ? (title.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false).toBe(true)
  })

  it('does not re-request a URL that already responded', async () => {
    const editor = makeEditor('')
    let requests = 0
    editor.element.addEventListener('wryte-embed-request', (event) => {
      requests++
      ;(event as CustomEvent).detail.respond({ title: 'T' })
    })
    applyInputRule(editor, 'https://example.com ')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toBe(1)
    // A later doc change must not re-fire the request.
    editor.insertString('after')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toBe(1)
  })

  it('re-requests a URL when the embed is removed and re-added', async () => {
    const editor = makeEditor('')
    let requests = 0
    editor.element.addEventListener('wryte-embed-request', () => requests++)
    applyInputRule(editor, 'https://example.com ')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toBe(1)
    editor.loadMarkdown('')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toBe(1)
    applyInputRule(editor, 'https://example.com ')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toBe(2)
  })

  it('keeps a typed URL as plain text on a non-empty line', () => {
    const editor = makeEditor('')
    editor.insertString('prefix')
    editor.insertString(' https://example.com ')
    expect(embedTypes(editor)).toEqual([])
    expect(editor.toMarkdown()).toBe('prefix https://example.com ')
  })

  it('degrades to a link mark inside a blockquote', () => {
    const editor = makeEditor('> ')
    editor.setSelectedRange([2, 2])
    editor.insertString('https://example.com')
    applyInputRule(editor, ' ')
    expect(embedTypes(editor)).toEqual([])
    expect(editor.toMarkdown()).toBe('> [https://example.com](https://example.com)')
  })

  it('inserts an embed via the insertEmbed API', () => {
    const editor = makeEditor('')
    expect(editor.insertEmbed('https://example.com/path')).toBe(true)
    expect(embedTypes(editor)[0].url).toBe('https://example.com/path')
    // The caret lands in the fresh paragraph after the card; with text on the
    // line a second embed must no-op.
    editor.insertString('text')
    expect(editor.insertEmbed('https://other.com')).toBe(false)
    expect(embedTypes(editor)).toHaveLength(1)
  })
})

describe('embed paste', () => {
  function paste(editor: Editor, text: string): void {
    // jsdom has no DataTransfer-backed ClipboardEvent, so stub the clipboard
    // data the way PM's paste handler reads it.
    const event = new Event('paste', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
    })
    editor.editorView.dom.dispatchEvent(event)
  }

  it('turns a pasted single URL on an empty line into an embed card', () => {
    const editor = makeEditor('')
    paste(editor, 'https://example.com')
    expect(embedTypes(editor)).toHaveLength(1)
    expect(embedTypes(editor)[0].host).toBe('example.com')
  })

  it('leaves non-URL pastes as normal text', () => {
    const editor = makeEditor('')
    paste(editor, 'just some text')
    expect(embedTypes(editor)).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('just some text')
  })

  it('keeps a URL pasted over a selection as plain text', () => {
    const editor = makeEditor('some text')
    editor.setSelectedRange([0, 4])
    paste(editor, 'https://example.com')
    expect(embedTypes(editor)).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('https://example.com text')
  })
})

describe('embed markdown', () => {
  function roundTrip(markdown: string): string {
    const doc = markdownParser.parse(markdown)
    if (!doc) return ''
    return markdownSerializer.serialize(doc).replace(/\n$/, '')
  }

  it('parses a lone-URL paragraph into an embed and serializes it back', () => {
    const doc = markdownParser.parse('https://example.com')
    const types = (doc?.toJSON() as { content?: { type: string }[] }).content?.map((c) => c.type)
    expect(types).toEqual(['embed'])
    expect(roundTrip('https://example.com')).toBe('https://example.com')
    expect(roundTrip('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    expect(roundTrip('example.com')).toBe('example.com')
  })

  it('extracts the host when parsing an embed', () => {
    const doc = markdownParser.parse('https://sub.example.com/x')
    const embed = (doc?.toJSON() as { content?: { type: string; attrs: Record<string, unknown> }[] }).content?.[0]
    expect(embed?.attrs.host).toBe('sub.example.com')
  })

  it('does not turn URLs in a blockquote or mixed lines into embeds', () => {
    expect(roundTrip('> https://example.com')).toBe('> https://example.com')
    expect(roundTrip('see https://example.com here')).toBe('see https://example.com here')
  })

  it('fires wryte-embed-request for embeds loaded from markdown', async () => {
    const editor = makeEditor('')
    const requested: string[] = []
    editor.element.addEventListener('wryte-embed-request', (event) => {
      requested.push((event as CustomEvent).detail.url)
    })
    editor.loadMarkdown('https://example.com')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requested).toEqual(['https://example.com'])
  })

  it('fires wryte-embed-request for embeds in the initial document', async () => {
    const editor = makeEditor('https://example.com')
    const requested: string[] = []
    // Listener attached after construction still catches the request, because
    // the initial embed scan is deferred to the next tick.
    editor.element.addEventListener('wryte-embed-request', (event) => {
      requested.push((event as CustomEvent).detail.url)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requested).toEqual(['https://example.com'])
  })

  it('fills a card loaded in the initial document via the deferred request', async () => {
    const editor = makeEditor('https://example.com')
    editor.element.addEventListener('wryte-embed-request', (event) => {
      ;(event as CustomEvent).detail.respond({ title: 'Example', image: 'https://cdn.example.com/x.png' })
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(embedTypes(editor)).toEqual([
      { url: 'https://example.com', host: 'example.com', title: 'Example', image: 'https://cdn.example.com/x.png' },
    ])
    expect(embedCardDom(editor)?.querySelector('.wryte-embed-title')?.textContent).toBe('Example')
  })
})

describe('embed HTML', () => {
  it('serializes an embed card to HTML and restores it', async () => {
    const editor = makeEditor('')
    editor.element.addEventListener('wryte-embed-request', (event) => {
      ;(event as CustomEvent).detail.respond({ title: 'Example', image: 'https://cdn.example.com/cover.png' })
    })
    editor.insertEmbed('https://example.com')
    await new Promise((resolve) => setTimeout(resolve, 0))

    const html = editor.toHTML()
    expect(html).toContain('class="wryte-embed"')
    expect(html).toContain('data-wryte-url="https://example.com"')
    expect(html).toContain('https://cdn.example.com/cover.png')
    expect(html).toContain('Example')

    const restored = makeEditor()
    restored.loadHTML(html)
    expect(embedTypes(restored)).toEqual([
      { url: 'https://example.com', host: 'example.com', title: 'Example', image: 'https://cdn.example.com/cover.png' },
    ])
  })
})

describe('embed card rendering', () => {
  it('styles the card: flex row, max-width 20rem, padded with a 1:1 cover image', () => {
    const style = Array.from(document.head.querySelectorAll('style')).find((el) => el.textContent?.includes('div.wryte-embed'))
    const css = style?.textContent ?? ''
    expect(css).toMatch(/\.ProseMirror div\.wryte-embed\{[^}]*max-width:20rem/)
    // The image sits on the left, square and cover-cropped; the card is a flex
    // row centered vertically (so a bare host centers too).
    expect(css).toMatch(/\.ProseMirror div\.wryte-embed\{[^}]*display:flex/)
    expect(css).toMatch(/\.ProseMirror div\.wryte-embed\{[^}]*align-items:center/)
    expect(css).toMatch(/\.ProseMirror \.wryte-embed-image\{[^}]*aspect-ratio:1\/1/)
    expect(css).toMatch(/\.ProseMirror \.wryte-embed-image\{[^}]*object-fit:cover/)
    expect(css).toMatch(/\.ProseMirror \.wryte-embed-image\{[^}]*border-radius:6px/)
    expect(css).toMatch(/\.ProseMirror \.wryte-embed-title\{[^}]*font-weight:600/)
  })

  it('highlights a selected embed card', () => {
    const editor = makeEditor('')
    editor.element.addEventListener('wryte-embed-request', (event) => {
      ;(event as CustomEvent).detail.respond({})
    })
    editor.insertEmbed('https://example.com')
    const card = embedCardDom(editor)
    expect(card?.classList.contains('wryte-selected')).toBe(false)
    editor.editorView.dispatch(
      editor.editorView.state.tr.setSelection(NodeSelection.create(editor.editorView.state.doc, 0)),
    )
    expect(card?.classList.contains('wryte-selected')).toBe(true)
  })
})
