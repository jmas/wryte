import { describe, expect, it, beforeEach } from 'vitest'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import { Editor, config, registerElement, Wryte, schema } from '../src/index'

function makeEditor(value = '', options: Record<string, unknown> = {}): Editor {
  const element = document.createElement('div')
  return new Editor(element, { value, toolbar: false, ...options })
}

// Simulates the input-rule prop evaluating text typed at the caret, as PM does
// before the characters are inserted.
function applyInputRule(editor: Editor, text: string): void {
  const { from, to } = editor.editorView.state.selection
  editor.editorView.someProp('handleTextInput', (fn) => fn(editor.editorView, from, to, text, () => editor.editorView.state.tr))
}

// True when the document contains a blockquote nested inside another blockquote.
function hasNestedBlockquote(editor: Editor): boolean {
  let nested = false
  editor.getDocument().descendants((node) => {
    if (node.type.name !== 'blockquote') return
    node.descendants((child) => {
      if (child.type.name === 'blockquote') nested = true
    })
  })
  return nested
}

describe('exports', () => {
  it('exposes the public surface', () => {
    expect(Editor).toBeTypeOf('function')
    expect(config).toEqual({
      autofocus: false,
      disableSpellcheck: false,
      multiline: true,
      tabIndex: 0,
      placeholder: '',
      toolbar: false,
      contextMenu: true,
      uploadTimeout: null,
      editable: true,
    })
    expect(registerElement).toBeTypeOf('function')
    expect(Wryte.Editor).toBe(Editor)
  })

  it('registers custom elements', () => {
    registerElement()
    expect(customElements.get('wryte-editor')).toBeTypeOf('function')
    registerElement()
  })
})

describe('Editor', () => {
  let editor: Editor

  beforeEach(() => {
    editor = makeEditor('## Hello\n\nSome **bold** text.')
  })

  it('wires the element value to markdown', () => {
    expect(editor.toMarkdown()).toContain('## Hello')
    const elementValue = (editor.element as unknown as { value: string }).value
    expect(elementValue).toBe(editor.toMarkdown())
  })

  it('loads markdown and serializes it back', () => {
    editor.loadMarkdown('New *content* with `code`')
    expect(editor.toMarkdown()).toBe('New *content* with `code`')
    editor.loadMarkdown('')
    expect(editor.toMarkdown()).toBe('')
  })

  it('exposes the full Trix-compatible method surface', () => {
    const methods = [
      'loadHTML', 'loadJSON', 'loadDocument', 'loadMarkdown', 'loadSnapshot',
      'getDocument', 'getSelectedDocument', 'getSnapshot', 'toJSON',
      'toHTML', 'toMarkdown',
      'insertAttachment', 'insertAttachments', 'insertDocument', 'insertFile',
      'insertFiles', 'insertHTML', 'insertString', 'insertText', 'insertLineBreak',
      'insertHorizontalRule', 'insertEmbed',
      'deleteInDirection', 'getSelectedRange', 'setSelectedRange', 'getPosition',
      'getClientRectAtPosition', 'moveCursorInDirection', 'expandSelectionInDirection',
      'activateAttribute', 'attributeIsActive', 'canActivateAttribute',
      'deactivateAttribute', 'toggleAttribute', 'setLink', 'unlink', 'setBlockCode',
      'setImageAlt',
      'canDecreaseNestingLevel', 'canIncreaseNestingLevel', 'decreaseNestingLevel',
      'increaseNestingLevel', 'canRedo', 'canUndo', 'undo', 'redo', 'recordUndoEntry',
      'focus', 'blur', 'disable', 'enable', 'clear', 'dispatch',
    ]
    for (const method of methods) {
      expect(typeof (editor as unknown as Record<string, unknown>)[method], method).toBe('function')
    }
  })

  it('inserts strings with current marks', () => {
    editor.loadMarkdown('plain')
    editor.setSelectedRange([0, 0])
    editor.activateAttribute('bold')
    editor.insertString('B')
    expect(editor.toMarkdown()).toContain('**B**')
  })

  it('toggles text attributes over a selection', () => {
    editor.loadMarkdown('Some text')
    editor.setSelectedRange([0, 9])
    editor.activateAttribute('italic')
    expect(editor.toMarkdown()).toBe('*Some text*')
    editor.setSelectedRange([0, 9])
    editor.deactivateAttribute('italic')
    expect(editor.toMarkdown()).toBe('Some text')
  })

  it('sets links and reports them active', () => {
    editor.loadMarkdown('Some text')
    editor.setSelectedRange([0, 4])
    editor.setLink('https://example.com')
    expect(editor.toMarkdown()).toContain('[Some](https://example.com)')
    editor.setSelectedRange([0, 4])
    expect(editor.attributeIsActive('href')).toBe(true)
  })

  it('sets the alt text on a selected block image and clears it with whitespace', () => {
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', alt: 'old', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    const doc = editor.editorView.state.doc
    let imgPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && imgPos === -1) {
        imgPos = pos
        return false
      }
    })
    expect(imgPos).toBeGreaterThan(-1)
    editor.editorView.dispatch(editor.editorView.state.tr.setSelection(NodeSelection.create(doc, imgPos)))

    editor.setImageAlt('  new alt  ')
    expect(editor.toMarkdown()).toContain('![new alt](https://example.com/x.png)')

    editor.setImageAlt('   ')
    expect(editor.toMarkdown()).toContain('![x.png](https://example.com/x.png)')
  })

  it('does nothing when setImageAlt is called without a selected image', () => {
    editor.loadMarkdown('some text\n\n![old](https://example.com/x.png)')
    editor.setSelectedRange([0, 1])
    editor.setImageAlt('nope')
    expect(editor.toMarkdown()).toBe('some text\n\n![old](https://example.com/x.png)')
  })

  it('toggles block attributes', () => {
    editor.loadMarkdown('a paragraph')
    editor.setSelectedRange([0, 0])
    editor.activateAttribute('heading2')
    expect(editor.attributeIsActive('heading2')).toBe(true)
    expect(editor.toMarkdown()).toMatch(/^## a paragraph/)
    editor.deactivateAttribute('heading2')
    expect(editor.toMarkdown()).toBe('a paragraph')
  })

  it('cycles the heading button: paragraph -> H2 -> H3 -> paragraph', () => {
    editor.loadMarkdown('a paragraph')
    editor.setSelectedRange([0, 0])
    editor.toggleAttribute('heading2')
    expect(editor.toMarkdown()).toMatch(/^## a paragraph/)
    expect(editor.attributeIsActive('heading2')).toBe(true)
    editor.toggleAttribute('heading2')
    expect(editor.toMarkdown()).toMatch(/^### a paragraph/)
    expect(editor.attributeIsActive('heading3')).toBe(true)
    expect(editor.attributeIsActive('heading2')).toBe(false)
    editor.toggleAttribute('heading2')
    expect(editor.toMarkdown()).toBe('a paragraph')
    expect(editor.attributeIsActive('heading2')).toBe(false)
  })

  it('cycles the list button: paragraph -> bullet -> number -> paragraph', () => {
    editor.loadMarkdown('a paragraph')
    editor.setSelectedRange([0, 0])
    editor.toggleAttribute('bullet')
    expect(editor.toMarkdown()).toMatch(/^\* a paragraph/)
    expect(editor.attributeIsActive('bullet')).toBe(true)
    editor.toggleAttribute('bullet')
    expect(editor.toMarkdown()).toMatch(/^1\. a paragraph/)
    expect(editor.attributeIsActive('number')).toBe(true)
    expect(editor.attributeIsActive('bullet')).toBe(false)
    editor.toggleAttribute('bullet')
    expect(editor.toMarkdown()).toBe('a paragraph')
    expect(editor.attributeIsActive('bullet')).toBe(false)
  })

  it('cycles the emphasis button: none -> bold -> italic -> strike -> none', () => {
    editor.loadMarkdown('a paragraph')
    editor.setSelectedRange([0, 11])
    editor.toggleAttribute('bold')
    expect(editor.toMarkdown()).toBe('**a paragraph**')
    expect(editor.attributeIsActive('bold')).toBe(true)
    editor.toggleAttribute('bold')
    expect(editor.toMarkdown()).toBe('*a paragraph*')
    expect(editor.attributeIsActive('italic')).toBe(true)
    expect(editor.attributeIsActive('bold')).toBe(false)
    editor.toggleAttribute('bold')
    expect(editor.toMarkdown()).toBe('~~a paragraph~~')
    expect(editor.attributeIsActive('strike')).toBe(true)
    expect(editor.attributeIsActive('italic')).toBe(false)
    editor.toggleAttribute('bold')
    expect(editor.toMarkdown()).toBe('a paragraph')
    expect(editor.attributeIsActive('strike')).toBe(false)
  })

  it('cycles the code/spoiler button: none -> spoiler -> code -> none', () => {
    editor.loadMarkdown('a paragraph')
    editor.setSelectedRange([0, 4])
    editor.toggleAttribute('code')
    expect(editor.toMarkdown()).toBe('||a pa||ragraph')
    expect(editor.attributeIsActive('spoiler')).toBe(true)
    editor.toggleAttribute('code')
    expect(editor.toMarkdown()).toBe('`a pa`ragraph')
    expect(editor.attributeIsActive('code')).toBe(true)
    expect(editor.attributeIsActive('spoiler')).toBe(false)
    editor.toggleAttribute('code')
    expect(editor.toMarkdown()).toBe('a paragraph')
    expect(editor.attributeIsActive('code')).toBe(false)
  })

  it('applies and removes the spoiler attribute directly', () => {
    editor.loadMarkdown('Some text')
    editor.setSelectedRange([0, 9])
    editor.activateAttribute('spoiler')
    expect(editor.toMarkdown()).toBe('||Some text||')
    expect(editor.attributeIsActive('spoiler')).toBe(true)
    expect(editor.attributeIsActive('strike')).toBe(false)
    editor.deactivateAttribute('spoiler')
    expect(editor.toMarkdown()).toBe('Some text')
  })

  it('deactivateAttribute("strike") only removes strikethrough', () => {
    editor.loadMarkdown('a paragraph')
    editor.setSelectedRange([0, 11])
    editor.activateAttribute('strike')
    editor.deactivateAttribute('strike')
    expect(editor.toMarkdown()).toBe('a paragraph')
    expect(editor.attributeIsActive('strike')).toBe(false)
  })

  it('applies a spoiler to a caret as a stored mark', () => {
    editor.loadMarkdown('text')
    editor.setSelectedRange([0, 0])
    editor.activateAttribute('spoiler')
    editor.insertString('hidden')
    expect(editor.toMarkdown()).toBe('||hidden||text')
  })

  it('converts a multi-item bullet list to a numbered list via the cycle', () => {
    editor.loadMarkdown('- one\n- two')
    editor.setSelectedRange([1, 1])
    editor.toggleAttribute('bullet')
    expect(editor.toMarkdown()).toBe('1. one\n2. two')
    expect(editor.attributeIsActive('number')).toBe(true)
  })

  it('lifts a list item out of the list before converting it to a heading', () => {
    editor.loadMarkdown('- one\n- two')
    editor.setSelectedRange([2, 2])
    editor.activateAttribute('heading2')
    expect(editor.attributeIsActive('heading2')).toBe(true)
    expect(editor.attributeIsActive('bullet')).toBe(false)
    expect(editor.toMarkdown()).toMatch(/^## one/)
    expect(editor.toMarkdown()).toContain('* two')
  })

  it('converts a heading already nested in a list by lifting it out', () => {
    editor.loadMarkdown('- ## one\n- two')
    editor.setSelectedRange([2, 2])
    editor.toggleAttribute('heading2')
    expect(editor.attributeIsActive('heading2')).toBe(true)
    expect(editor.attributeIsActive('bullet')).toBe(false)
    expect(editor.toMarkdown()).toMatch(/^## one/)
    expect(editor.toMarkdown()).toContain('* two')
  })

  describe('code attribute', () => {
    it('applies block code to a fully selected paragraph', () => {
      editor.loadMarkdown('const x = 1')
      editor.setSelectedRange([0, 11])
      editor.activateAttribute('code')
      expect(editor.toMarkdown()).toBe('```\nconst x = 1\n```')
      expect(editor.attributeIsActive('code')).toBe(true)
    })

    it('applies block code to multiple fully selected paragraphs', () => {
      editor.loadMarkdown('first\n\nsecond')
      editor.setSelectedRange([0, 12])
      editor.activateAttribute('code')
      expect(editor.toMarkdown()).toBe('```\nfirst\nsecond\n```')
    })

    it('applies inline code to a partial text selection', () => {
      editor.loadMarkdown('select part of this text')
      editor.setSelectedRange([0, 6])
      editor.activateAttribute('code')
      expect(editor.toMarkdown()).toBe('`select` part of this text')
      expect(editor.attributeIsActive('code')).toBe(true)
      editor.deactivateAttribute('code')
      expect(editor.toMarkdown()).toBe('select part of this text')
    })

    it('applies inline code to a caret', () => {
      editor.loadMarkdown('text')
      editor.setSelectedRange([0, 0])
      editor.activateAttribute('code')
      editor.insertString('code')
      expect(editor.toMarkdown()).toBe('`code`text')
    })

    it('deactivates whole-block code back to a paragraph', () => {
      editor.loadMarkdown('const x = 1')
      editor.setSelectedRange([0, 11])
      editor.activateAttribute('code')
      editor.deactivateAttribute('code')
      expect(editor.toMarkdown()).toBe('const x = 1')
    })

    it('splits a multi-line code block into paragraphs on deactivate', () => {
      editor.loadMarkdown('```\nline one\nline two\n```')
      editor.setSelectedRange([0, 1])
      editor.deactivateAttribute('code')
      expect(editor.toMarkdown()).toBe('line one\n\nline two')
    })
  })

  describe('quote attribute', () => {
    it('wraps a paragraph in a blockquote', () => {
      editor.loadMarkdown('a paragraph')
      editor.setSelectedRange([0, 0])
      editor.activateAttribute('quote')
      expect(editor.attributeIsActive('quote')).toBe(true)
      expect(editor.toMarkdown()).toBe('> a paragraph')
    })

    it('cannot nest a blockquote inside a blockquote', () => {
      editor.loadMarkdown('> outer\n\nplain')
      editor.setSelectedRange([1, 1])
      editor.activateAttribute('quote')
      expect(editor.toMarkdown()).toBe('> outer\n\nplain')
    })

    it('canActivateAttribute("quote") is false inside a blockquote', () => {
      editor.loadMarkdown('> outer\n\nplain')
      editor.setSelectedRange([1, 1])
      expect(editor.canActivateAttribute('quote')).toBe(false)
      editor.setSelectedRange([9, 9])
      expect(editor.canActivateAttribute('quote')).toBe(true)
    })

    it('the > input rule does not nest a blockquote inside a blockquote', () => {
      editor.loadMarkdown('> outer\n\nplain')
      editor.setSelectedRange([1, 1])
      applyInputRule(editor, '> ')
      expect(hasNestedBlockquote(editor)).toBe(false)
      expect(editor.toMarkdown()).toBe('> outer\n\nplain')
    })

    it('the > input rule wraps a paragraph at the start of a line', () => {
      editor.loadMarkdown('plain')
      editor.setSelectedRange([0, 0])
      applyInputRule(editor, '> ')
      expect(editor.toMarkdown()).toBe('> plain')
      expect(editor.attributeIsActive('quote')).toBe(true)
    })

    it('converts a heading to a paragraph when quoted', () => {
      editor.loadMarkdown('## title')
      editor.setSelectedRange([0, 0])
      editor.activateAttribute('quote')
      expect(editor.toMarkdown()).toBe('> title')
      expect(editor.attributeIsActive('quote')).toBe(true)
    })

    it('converts a code block to paragraphs when quoted', () => {
      editor.loadMarkdown('```\nline one\nline two\n```')
      editor.setSelectedRange([2, 2])
      editor.activateAttribute('quote')
      expect(editor.toMarkdown()).toBe('> line one\n>\n> line two')
    })

    it('cannot quote a block inside a list', () => {
      editor.loadMarkdown('- one')
      editor.setSelectedRange([2, 2])
      expect(editor.canActivateAttribute('quote')).toBe(false)
      editor.activateAttribute('quote')
      expect(editor.toMarkdown()).toBe('* one')
    })

    it('cannot create block code inside a blockquote', () => {
      editor.loadMarkdown('> quoted')
      editor.setSelectedRange([0, 7])
      editor.activateAttribute('code')
      expect(editor.toMarkdown()).toBe('> quoted')
      expect(editor.canActivateAttribute('code')).toBe(false)
    })

    it('disables heading activation inside a blockquote', () => {
      editor.loadMarkdown('> quoted')
      editor.setSelectedRange([1, 1])
      expect(editor.canActivateAttribute('heading2')).toBe(false)
      editor.activateAttribute('heading2')
      expect(editor.toMarkdown()).toBe('> quoted')
    })

    it('loads non-paragraph blockquote markdown as paragraphs', () => {
      editor.loadMarkdown('> # heading\n>\n> > nested')
      expect(editor.toMarkdown()).toBe('> heading\n>\n> nested')
    })

    it('lifts non-paragraph content out of a blockquote when loading HTML', () => {
      editor.loadHTML('<blockquote><p>quoted</p><h2>head</h2></blockquote>')
      expect(editor.toMarkdown()).toBe('> quoted\n\n## head')
    })

    it('normalizes blockquote content when loading a snapshot', () => {
      editor.loadJSON({
        document: {
          type: 'doc',
          content: [
            {
              type: 'blockquote',
              content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }],
            },
          ],
        },
        selectedRange: [0, 0],
      })
      expect(editor.toMarkdown()).toBe('> x')
    })
  })

  describe('keyboard behavior', () => {
    function pressKey(editor: Editor, key: string, mod = false): void {
      editor.editorView.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: mod }),
      )
    }

    it('Enter inside a list item creates a new list item', () => {
      editor.loadMarkdown('- one\n- two')
      // setSelectedRange clamps oversized offsets to the end of the document.
      editor.setSelectedRange([editor.toMarkdown().length, editor.toMarkdown().length])
      pressKey(editor, 'Enter')
      expect(editor.toMarkdown()).toBe('* one\n* two\n* ')
      expect(editor.attributeIsActive('bullet')).toBe(true)
    })

    it('Enter on an empty list item lifts out to a paragraph', () => {
      editor.loadMarkdown('- one\n- ')
      editor.setSelectedRange([6, 6])
      pressKey(editor, 'Enter')
      expect(editor.toMarkdown()).toBe('* one')
      expect(editor.attributeIsActive('bullet')).toBe(false)
    })

    it('Enter on a non-empty code line adds a new line', () => {
      editor.loadMarkdown('```\nfoo\n```')
      editor.setSelectedRange([3, 3])
      pressKey(editor, 'Enter')
      expect(editor.toMarkdown()).toBe('```\nfoo\n\n```')
      expect(editor.attributeIsActive('code')).toBe(true)
    })

    it('Mod-Enter adds a new line inside a code block', () => {
      editor.loadMarkdown('```\nfoo\n```')
      editor.setSelectedRange([3, 3])
      pressKey(editor, 'Enter', true)
      expect(editor.toMarkdown()).toBe('```\nfoo\n\n```')
      expect(editor.attributeIsActive('code')).toBe(true)
    })

    it('Enter on an empty code line exits the block into a paragraph', () => {
      editor.loadMarkdown('```\nfoo\n\n```')
      editor.setSelectedRange([4, 4])
      pressKey(editor, 'Enter')
      editor.insertString('after')
      expect(editor.toMarkdown()).toBe('```\nfoo\n```\n\nafter')
      expect(editor.attributeIsActive('code')).toBe(false)
    })

    it('Enter on an empty code block collapses it to a paragraph', () => {
      editor.loadMarkdown('```\n```')
      editor.setSelectedRange([0, 0])
      pressKey(editor, 'Enter')
      expect(editor.toMarkdown()).toBe('')
      expect(editor.attributeIsActive('code')).toBe(false)
    })

    it('Enter on an empty line inside a code block splits around a paragraph', () => {
      editor.loadMarkdown('```\nfoo\n\nbar\n```')
      // Offset 4 is the second "\n" in "foo\n\nbar" — the start of the empty line.
      editor.setSelectedRange([4, 4])
      pressKey(editor, 'Enter')
      editor.insertString('X')
      expect(editor.toMarkdown()).toBe('```\nfoo\n```\n\nX\n\n```\nbar\n```')
      expect(editor.attributeIsActive('code')).toBe(false)
    })
  })

  it('supports undo and redo', () => {
    editor.loadMarkdown('')
    editor.insertString('first')
    editor.recordUndoEntry('second')
    editor.insertString(' second')
    expect(editor.canUndo()).toBe(true)
    editor.undo()
    expect(editor.toMarkdown()).toBe('first')
    editor.redo()
    expect(editor.toMarkdown()).toBe('first second')
    editor.undo()
    editor.undo()
    expect(editor.toMarkdown()).toBe('')
    expect(editor.canRedo()).toBe(true)
  })

  it('round-trips snapshots', () => {
    const snapshot = editor.getSnapshot()
    expect(snapshot.document).toBeTruthy()
    editor.loadMarkdown('replacement')
    editor.loadSnapshot(snapshot)
    expect(editor.toMarkdown()).toBe(editor.toMarkdown())
    expect(editor.getSnapshot().document).toEqual(snapshot.document)
  })

  it('maps text offsets to selections', () => {
    editor.loadMarkdown('hello world')
    editor.setSelectedRange([0, 5])
    expect(editor.getSelectedRange()).toEqual([0, 5])
    expect(editor.getSelectedDocument()?.content.textBetween(0, 5)).toBe('hello')
  })

  it('dispatches selection-change events', () => {
    const seen: Array<[number, number]> = []
    editor.element.addEventListener('wryte-selection-change', (event) => {
      const detail = (event as CustomEvent).detail as { selection: [number, number] }
      seen.push(detail.selection)
    })
    editor.setSelectedRange([2, 4])
    expect(seen.length).toBeGreaterThan(0)
  })

  it('dispatches change events on edits', () => {
    let changes = 0
    editor.element.addEventListener('wryte-change', () => changes++)
    editor.insertString('more')
    expect(changes).toBeGreaterThan(0)
  })

  it('reports document state', () => {
    expect(editor.isEmpty).toBe(false)
    editor.clear()
    expect(editor.isEmpty).toBe(true)
    expect(editor.edited).toBe(true)
  })
})

describe('HTML IO', () => {
  it('loads and produces HTML', () => {
    const editor = makeEditor()
    editor.loadHTML('<p>Hello <strong>world</strong></p>')
    expect(editor.toMarkdown()).toBe('Hello **world**')
    const html = editor.toHTML()
    expect(html).toContain('<strong>world</strong>')
  })

  it('round-trips spoilers through HTML', () => {
    const editor = makeEditor('some ||hidden|| text')
    const html = editor.toHTML()
    expect(html).toContain('<span class="wryte-spoiler">hidden</span>')
    editor.loadHTML('<p>some <span class="wryte-spoiler">hidden</span> text</p>')
    expect(editor.toMarkdown()).toBe('some ||hidden|| text')
    editor.loadHTML('<p>plain <span class="spoiler">also</span> ok</p>')
    expect(editor.toMarkdown()).toBe('plain ||also|| ok')
  })
})

describe('selection highlight', () => {
  const selectNode = (editor: Editor, pos: number): void => {
    const { state } = editor.editorView
    editor.editorView.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
  }
  const selectRange = (editor: Editor, from: number, to: number): void => {
    const { state } = editor.editorView
    editor.editorView.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
  }

  it('highlights a clicked block image', () => {
    const editor = makeEditor()
    editor.loadHTML('<img src="x.png" alt="a">')
    const wrapper = editor.element.querySelector('.wryte-image') as HTMLElement
    expect(wrapper.classList.contains('wryte-selected')).toBe(false)
    selectNode(editor, 0)
    expect(wrapper.classList.contains('wryte-selected')).toBe(true)
  })

  it('highlights an image covered by a range selection', () => {
    const editor = makeEditor()
    editor.loadHTML('<p>aa</p><img src="x.png" alt="a"><p>bb</p>')
    const wrapper = editor.element.querySelector('.wryte-image') as HTMLElement
    selectRange(editor, 2, 7)
    expect(wrapper.classList.contains('wryte-selected')).toBe(true)
    // A caret on either side of the image is not a selection over it.
    selectRange(editor, 1, 1)
    expect(wrapper.classList.contains('wryte-selected')).toBe(false)
  })

  it('highlights a selected horizontal rule', () => {
    const editor = makeEditor()
    editor.loadHTML('<hr>')
    const hr = editor.element.querySelector('hr') as HTMLElement
    expect(hr.classList.contains('wryte-selected')).toBe(false)
    selectNode(editor, 0)
    expect(hr.classList.contains('wryte-selected')).toBe(true)
  })

  it('does not highlight an inline attachment', () => {
    const editor = makeEditor()
    editor.loadHTML('<p>a <span data-wryte-attachment>x</span></p>')
    const span = editor.element.querySelector('span[data-wryte-attachment]') as HTMLElement
    selectRange(editor, 1, editor.getDocument().content.size)
    expect(span.classList.contains('wryte-selected')).toBe(false)
  })
})
