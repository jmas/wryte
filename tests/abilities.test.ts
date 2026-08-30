import { afterEach, describe, expect, it } from 'vitest'
import { NodeSelection } from 'prosemirror-state'
import { Editor, schema, ALL_ABILITIES } from '../src/index'

function makeEditor(value = '', options: Record<string, unknown> = {}): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor(element, { toolbar: false, contextMenu: true, value, ...options })
}

// Simulates the input-rule prop evaluating text typed at the caret, as PM does
// before the characters are inserted.
function applyInputRule(editor: Editor, text: string): void {
  const { from, to } = editor.editorView.state.selection
  editor.editorView.someProp('handleTextInput', (fn) => fn(editor.editorView, from, to, text, () => editor.editorView.state.tr))
}

function pressKey(editor: Editor, key: string, mod = false): void {
  editor.editorView.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: mod }))
}

function imageFile(name = 'photo.png'): File {
  return new File(['bytes'], name, { type: 'image/png' })
}

function selectFirstImage(editor: Editor): void {
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
}

function menu(): HTMLElement | null {
  return document.querySelector('.wryte-context-menu')
}

afterEach(() => {
  menu()?.remove()
  document.body.innerHTML = ''
})

describe('abilities whitelist', () => {
  it('enables every ability by default (null config)', () => {
    const editor = makeEditor()
    expect(editor.options.abilities).toBeNull()
    for (const ability of ALL_ABILITIES) expect(editor.abilityEnabled(ability)).toBe(true)
  })

  it('restricts the editor to the listed abilities', () => {
    const editor = makeEditor('', { abilities: ['bold', 'quote'] })
    expect(editor.abilityEnabled('bold')).toBe(true)
    expect(editor.abilityEnabled('quote')).toBe(true)
    for (const ability of ALL_ABILITIES) {
      if (ability === 'bold' || ability === 'quote') continue
      expect(editor.abilityEnabled(ability)).toBe(false)
    }
  })

  it('disables everything with an empty whitelist', () => {
    const editor = makeEditor('', { abilities: [] })
    for (const ability of ALL_ABILITIES) expect(editor.abilityEnabled(ability)).toBe(false)
  })
})

describe('attribute gating', () => {
  it('canActivateAttribute returns false for a disabled ability', () => {
    const editor = makeEditor('some text', { abilities: ['bold'] })
    editor.setSelectedRange([0, 4])
    expect(editor.canActivateAttribute('bold')).toBe(true)
    expect(editor.canActivateAttribute('italic')).toBe(false)
    expect(editor.canActivateAttribute('strike')).toBe(false)
    expect(editor.canActivateAttribute('heading2')).toBe(false)
    expect(editor.canActivateAttribute('quote')).toBe(false)
  })

  it('does not apply a disabled inline attribute', () => {
    const editor = makeEditor('some text', { abilities: ['bold'] })
    editor.setSelectedRange([0, 4])
    editor.activateAttribute('italic')
    editor.toggleAttribute('strike')
    expect(editor.toMarkdown()).toBe('some text')
  })

  it('does not apply a disabled block attribute', () => {
    const editor = makeEditor('some text', { abilities: ['bold'] })
    editor.setSelectedRange([0, 4])
    editor.activateAttribute('heading2')
    editor.activateAttribute('quote')
    editor.activateAttribute('bullet')
    expect(editor.toMarkdown()).toBe('some text')
  })

  it('still deactivates formatting that came from loaded content', () => {
    const editor = makeEditor('## Heading', { abilities: [] })
    editor.setSelectedRange([3, 3])
    editor.deactivateAttribute('heading2')
    expect(editor.toMarkdown()).toBe('Heading')
  })

  it('does not gate `code` as a code block when the codeBlock ability is off', () => {
    const editor = makeEditor('a paragraph', { abilities: ['code'] })
    // A partial text selection uses the inline `code` ability.
    editor.setSelectedRange([0, 4])
    expect(editor.canActivateAttribute('code')).toBe(true)
    editor.toggleAttribute('code')
    expect(editor.toMarkdown()).toBe('`a pa`ragraph')
    editor.toggleAttribute('code')
    expect(editor.toMarkdown()).toBe('a paragraph')
    // A whole-block selection still uses the inline `code` ability; block
    // code_block is only created from an empty line via `setBlockCode`.
    editor.setSelectedRange([0, 11])
    expect(editor.canActivateAttribute('code')).toBe(true)
    editor.toggleAttribute('code')
    expect(editor.toMarkdown()).toBe('`a paragraph`')
  })

  it('cycles the emphasis button only through enabled styles', () => {
    const editor = makeEditor('a paragraph', { abilities: ['bold', 'strike'] })
    editor.setSelectedRange([0, 11])
    editor.toggleAttribute('bold') // none -> bold
    expect(editor.toMarkdown()).toBe('**a paragraph**')
    editor.toggleAttribute('bold') // bold -> strike (italic is skipped)
    expect(editor.toMarkdown()).toBe('~~a paragraph~~')
    editor.toggleAttribute('bold') // strike -> none
    expect(editor.toMarkdown()).toBe('a paragraph')
  })

  it('cycles the code/spoiler button only through enabled styles', () => {
    const editor = makeEditor('a paragraph', { abilities: ['code'] })
    editor.setSelectedRange([0, 4])
    editor.toggleAttribute('code') // none -> code (spoiler is skipped)
    expect(editor.toMarkdown()).toBe('`a pa`ragraph')
    editor.toggleAttribute('code') // code -> none
    expect(editor.toMarkdown()).toBe('a paragraph')
  })
})

describe('insertion gating', () => {
  it('does not convert to a code block when codeBlock is disabled', () => {
    const editor = makeEditor('', { abilities: ['code'] })
    editor.focus()
    editor.setBlockCode()
    expect(editor.attributeIsActive('code')).toBe(false)
    expect(editor.toMarkdown()).toBe('')
  })

  it('converts to a code block when codeBlock is enabled', () => {
    const editor = makeEditor('', { abilities: ['codeBlock'] })
    editor.focus()
    editor.setBlockCode()
    expect(editor.attributeIsActive('code')).toBe(true)
  })

  it('does not insert a horizontal rule when disabled', () => {
    const editor = makeEditor('one', { abilities: [] })
    editor.setSelectedRange([3, 3])
    editor.insertHorizontalRule()
    expect(editor.toMarkdown()).toBe('one')
  })

  it('does not link when the link ability is disabled', () => {
    const editor = makeEditor('some text', { abilities: [] })
    editor.setSelectedRange([0, 4])
    editor.setLink('https://example.com')
    expect(editor.toMarkdown()).toBe('some text')
  })

  it('still unlinks existing links when the link ability is disabled', () => {
    const editor = makeEditor('[text](https://example.com)', { abilities: [] })
    editor.setSelectedRange([0, 4])
    editor.unlink()
    expect(editor.toMarkdown()).toBe('text')
  })

  it('does not insert an embed when the embed ability is disabled', () => {
    const editor = makeEditor('', { abilities: [] })
    editor.focus()
    expect(editor.insertEmbed('https://example.com')).toBe(false)
    expect(editor.toMarkdown()).toBe('')
  })

  it('does not turn a typed URL into an embed when the embed ability is disabled', async () => {
    const editor = makeEditor('', { abilities: [] })
    let requests = 0
    editor.element.addEventListener('wryte-embed-request', () => requests++)
    applyInputRule(editor, 'https://example.com ')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toBe(0)
    expect(editor.toMarkdown()).toBe('')
  })

  it('does not apply the heading/quote/list input rules when disabled', () => {
    const editor = makeEditor('', { abilities: [] })
    editor.focus()
    applyInputRule(editor, '# ')
    expect(editor.attributeIsActive('heading2')).toBe(false)
    expect(editor.toMarkdown()).toBe('')
  })

  it('still applies the heading input rule when enabled', () => {
    const editor = makeEditor('', { abilities: ['heading'] })
    editor.focus()
    applyInputRule(editor, '# ')
    expect(editor.attributeIsActive('heading2')).toBe(true)
  })

  it('ignores files when the attach ability is disabled', () => {
    const editor = makeEditor('', { abilities: [] })
    let requests = 0
    editor.element.addEventListener('wryte-upload-request', () => requests++)
    editor.insertFiles([imageFile()])
    expect(editor.getAttachments()).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
    expect(requests).toBe(0)
  })

  it('inserts a previewable file as an inline attachment (not a block image) when image is disabled', () => {
    const editor = makeEditor('', { abilities: ['attach'] })
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    editor.insertFiles([imageFile()])

    let hasImage = false
    let hasAttachment = false
    editor.getDocument().descendants((node) => {
      if (node.type.name === 'image') hasImage = true
      if (node.type.name === 'attachment') hasAttachment = true
    })
    expect(hasImage).toBe(false)
    expect(hasAttachment).toBe(true)
  })

  it('inserts a previewable file as a block image when image is enabled', () => {
    const editor = makeEditor('', { abilities: ['attach', 'image'] })
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    editor.insertFiles([imageFile()])

    let hasImage = false
    let hasAttachment = false
    editor.getDocument().descendants((node) => {
      if (node.type.name === 'image') hasImage = true
      if (node.type.name === 'attachment') hasAttachment = true
    })
    expect(hasImage).toBe(true)
    expect(hasAttachment).toBe(false)
  })

  it('does not change the alt text when the image ability is disabled', () => {
    const editor = makeEditor('', { abilities: [] })
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
    editor.focus()
    selectFirstImage(editor)
    editor.setImageAlt('new')
    expect(editor.toMarkdown()).toContain('![old](')
    expect(editor.toMarkdown()).not.toContain('![new](')
  })
})

describe('keyboard shortcut gating', () => {
  it('does not apply bold via Mod-b when disabled', () => {
    const editor = makeEditor('some text', { abilities: [] })
    editor.setSelectedRange([0, 4])
    pressKey(editor, 'b', true)
    expect(editor.toMarkdown()).toBe('some text')
  })

  it('applies bold via Mod-b when enabled', () => {
    const editor = makeEditor('some text', { abilities: ['bold'] })
    editor.setSelectedRange([0, 4])
    pressKey(editor, 'b', true)
    expect(editor.toMarkdown()).toBe('**some** text')
  })

  it('does not apply italic via Mod-i when disabled', () => {
    const editor = makeEditor('some text', { abilities: ['bold'] })
    editor.setSelectedRange([0, 4])
    pressKey(editor, 'i', true)
    expect(editor.toMarkdown()).toBe('some text')
  })
})

describe('context menu gating', () => {
  it('shows only buttons for enabled abilities in the formatting bubble', () => {
    const editor = makeEditor('some text', { abilities: ['bold', 'quote'] })
    editor.focus()
    editor.setSelectedRange([0, 4])

    const bubble = menu()
    expect(bubble).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-attribute="bold"]')).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-attribute="quote"]')).not.toBeNull()
    // Disabled abilities get no button.
    expect(bubble!.querySelector('[data-wryte-attribute="code"]')).toBeNull()
    expect(bubble!.querySelector('[data-wryte-action="link"]')).toBeNull()
    expect(bubble!.querySelector('[data-wryte-attribute="heading2"]')).toBeNull()
    expect(bubble!.querySelector('[data-wryte-attribute="bullet"]')).toBeNull()
  })

  it('hides the formatting bubble when no relevant ability is enabled', () => {
    const editor = makeEditor('some text', { abilities: ['embed'] })
    editor.focus()
    editor.setSelectedRange([0, 4])
    expect(menu()).toBeNull()
  })

  it('does not show the (+) button when no block ability is enabled', () => {
    const editor = makeEditor('', { abilities: ['bold'] })
    editor.focus()
    expect(document.querySelector('.wryte-plus-button')).toBeNull()
  })

  it('shows only enabled block actions in the (+) popup', () => {
    const editor = makeEditor('', { abilities: ['heading', 'list'] })
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    expect(plus).not.toBeNull()
    plus!.click()

    const popup = menu()
    expect(popup).not.toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="heading2"]')).not.toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="list"]')).not.toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="attach"]')).toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="code"]')).toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="quote"]')).toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="hr"]')).toBeNull()
  })

  it('shows the attach button alone in the (+) popup when only attach is enabled', () => {
    const editor = makeEditor('', { abilities: ['attach'] })
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    expect(plus).not.toBeNull()
    plus!.click()

    const popup = menu()
    expect(popup).not.toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="attach"]')).not.toBeNull()
    expect(popup!.querySelector('[data-wryte-block-action="list"]')).toBeNull()
    expect(popup!.querySelector('.wryte-context-divider')).toBeNull()
  })

  it('hides the image tools bubble when the image ability is disabled', () => {
    const editor = makeEditor('', { abilities: [] })
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    editor.focus()
    selectFirstImage(editor)
    expect(menu()).toBeNull()
  })

  it('shows the image tools bubble when the image ability is enabled', () => {
    const editor = makeEditor('', { abilities: ['image'] })
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    editor.focus()
    selectFirstImage(editor)

    const bubble = menu()
    expect(bubble).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-image-action="edit"]')).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-image-action="trash"]')).not.toBeNull()
  })
})
