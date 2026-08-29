import { afterEach, describe, expect, it } from 'vitest'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import { Editor, schema } from '../src/index'
import { iconMarkup, type IconName } from '../src/icons'

function makeEditor(value = 'some text', options: Record<string, unknown> = {}): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor(element, { toolbar: false, value, ...options })
}

function rightClick(element: HTMLElement, x = 50, y = 50): void {
  element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
}

function menu(): HTMLElement | null {
  return document.querySelector('.wryte-context-menu')
}

// Selects the first block image node in the document (a NodeSelection).
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

// jsdom serializes self-closing SVG tags as `></path>`, so compare the path
// data rather than the raw markup.
function buttonIconPaths(button: HTMLButtonElement): string[] {
  return [...button.querySelectorAll('path')].map((path) => path.getAttribute('d')!)
}

function iconPaths(name: IconName): string[] {
  const div = document.createElement('div')
  div.innerHTML = iconMarkup(name)
  return [...div.querySelectorAll('path')].map((path) => path.getAttribute('d')!)
}

function expectIcon(button: HTMLButtonElement, name: IconName): void {
  expect(buttonIconPaths(button)).toEqual(iconPaths(name))
}

afterEach(() => {
  menu()?.remove()
  document.body.innerHTML = ''
})

describe('bubble menu', () => {
  it('is a bubble with icon buttons and opens on right-click', () => {
    const editor = makeEditor()
    rightClick(editor.element)

    const bubble = menu()
    expect(bubble).not.toBeNull()
    for (const attribute of ['bold', 'code', 'heading2', 'quote', 'bullet']) {
      expect(bubble!.querySelector(`[data-wryte-attribute="${attribute}"]`)).not.toBeNull()
    }
  })

  it('applies formatting from the bubble', () => {
    const editor = makeEditor()
    editor.setSelectedRange([0, 4])
    rightClick(editor.element)

    const emphasis = menu()!.querySelector('[data-wryte-attribute="bold"]') as HTMLButtonElement
    emphasis.click()
    expect(editor.toMarkdown()).toBe('**some** text')
  })

  it('applies bold from the emphasis bubble button without stealing focus', () => {
    const editor = makeEditor()
    editor.setSelectedRange([0, 4])
    rightClick(editor.element)

    // A real browser targets the SVG child (`SVGElement`, not `HTMLElement`)
    // on mousedown, so the focus guard must prevent default for those too.
    const button = menu()!.querySelector('[data-wryte-attribute="bold"]') as HTMLButtonElement
    const icon = button.querySelector('svg')!.firstElementChild! as SVGElement
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    icon.dispatchEvent(mousedown)
    expect(mousedown.defaultPrevented).toBe(true)
    button.click()
    expect(editor.toMarkdown()).toBe('**some** text')
  })

  it('cycles the emphasis bubble button in place: none -> bold -> italic -> strike -> none', () => {
    const editor = makeEditor('a paragraph')
    editor.setSelectedRange([0, 11])
    rightClick(editor.element)

    const button = menu()!.querySelector('[data-wryte-attribute="bold"]') as HTMLButtonElement
    expectIcon(button, 'bold')
    expect(button.classList.contains('is-active')).toBe(false)

    // The bubble stays open so the button can be pressed again to cycle.
    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('**a paragraph**')
    expectIcon(button, 'bold')
    expect(button.classList.contains('is-active')).toBe(true)

    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('*a paragraph*')
    expectIcon(button, 'italic')
    expect(button.classList.contains('is-active')).toBe(true)

    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('~~a paragraph~~')
    expectIcon(button, 'strike')
    expect(button.classList.contains('is-active')).toBe(true)

    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('a paragraph')
    expectIcon(button, 'bold')
    expect(button.classList.contains('is-active')).toBe(false)
  })

  it('cycles the code/spoiler bubble button in place: none -> spoiler -> code -> none', () => {
    const editor = makeEditor('a paragraph')
    editor.setSelectedRange([0, 4])
    rightClick(editor.element)

    const button = menu()!.querySelector('[data-wryte-attribute="code"]') as HTMLButtonElement
    expectIcon(button, 'spoiler')
    expect(button.classList.contains('is-active')).toBe(false)

    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('||a pa||ragraph')
    expectIcon(button, 'spoiler')
    expect(button.classList.contains('is-active')).toBe(true)

    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('`a pa`ragraph')
    expectIcon(button, 'code')
    expect(button.classList.contains('is-active')).toBe(true)

    button.click()
    expect(menu()).not.toBeNull()
    expect(editor.toMarkdown()).toBe('a paragraph')
    expectIcon(button, 'spoiler')
    expect(button.classList.contains('is-active')).toBe(false)
  })

  it('applies inline code, not a code block, over a whole-paragraph selection', () => {
    const editor = makeEditor('a paragraph')
    editor.setSelectedRange([0, 11])
    rightClick(editor.element)

    const button = menu()!.querySelector('[data-wryte-attribute="code"]') as HTMLButtonElement
    // The cycle starts at spoiler; two presses reach the code step.
    button.click()
    button.click()
    expect(editor.toMarkdown()).toBe('`a paragraph`')
    expect(editor.attributeIsActive('code')).toBe(true)
  })

  it('toggles block attributes from the bubble and keeps it open', () => {
    const editor = makeEditor('a paragraph')
    editor.setSelectedRange([0, 10])
    rightClick(editor.element)

    ;(menu()!.querySelector('[data-wryte-attribute="heading2"]') as HTMLButtonElement).click()
    expect(editor.toMarkdown()).toMatch(/^## a paragraph/)
    expect(menu()).not.toBeNull()
  })

  it('reflects the current heading level on the bubble heading button', () => {
    const editor = makeEditor('a paragraph')
    editor.setSelectedRange([0, 10])

    rightClick(editor.element)
    const heading = menu()!.querySelector('[data-wryte-attribute="heading2"]') as HTMLButtonElement
    expectIcon(heading, 'heading2')
    expect(heading.classList.contains('is-active')).toBe(false)

    heading.click()
    expect(menu()).not.toBeNull()
    expectIcon(heading, 'heading2')
    expect(heading.classList.contains('is-active')).toBe(true)
    expect(editor.toMarkdown()).toMatch(/^## a paragraph/)

    heading.click()
    expect(menu()).not.toBeNull()
    expectIcon(heading, 'heading3')
    expect(heading.classList.contains('is-active')).toBe(true)
    expect(editor.toMarkdown()).toMatch(/^### a paragraph/)

    heading.click()
    expect(menu()).not.toBeNull()
    expectIcon(heading, 'heading2')
    expect(heading.classList.contains('is-active')).toBe(false)
    expect(editor.toMarkdown()).toBe('a paragraph')
  })

  it('cycles the list button on the bubble: paragraph -> bullet -> number -> paragraph', () => {
    const editor = makeEditor('a paragraph')
    editor.setSelectedRange([0, 10])

    rightClick(editor.element)
    const list = menu()!.querySelector('[data-wryte-attribute="bullet"]') as HTMLButtonElement
    expect(list.classList.contains('is-active')).toBe(false)
    expectIcon(list, 'bullet')

    list.click()
    expect(menu()).not.toBeNull()
    expect(list.classList.contains('is-active')).toBe(true)
    expectIcon(list, 'bullet')

    list.click()
    expect(menu()).not.toBeNull()
    expect(list.classList.contains('is-active')).toBe(true)
    expectIcon(list, 'number')

    list.click()
    expect(menu()).not.toBeNull()
    expect(list.classList.contains('is-active')).toBe(false)
    expectIcon(list, 'bullet')
  })

  it('links text from the bubble', () => {
    const editor = makeEditor()
    editor.focus()
    editor.setSelectedRange([0, 4])
    rightClick(editor.element)

    ;(menu()!.querySelector('[data-wryte-action="link"]') as HTMLButtonElement).click()
    const input = menu()!.querySelector('.wryte-context-link-input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'https://example.com'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(editor.toMarkdown()).toBe('[some](https://example.com) text')
  })

  it('prefills the link form with the current link when editing', () => {
    const editor = makeEditor('[some](https://example.com) text')
    editor.setSelectedRange([0, 4])
    rightClick(editor.element)

    ;(menu()!.querySelector('[data-wryte-action="link"]') as HTMLButtonElement).click()
    const input = menu()!.querySelector('.wryte-context-link-input') as HTMLInputElement
    expect(input.value).toBe('https://example.com')
  })

  it('keeps the link form open when focusing its input blurs the editor', () => {
    const editor = makeEditor()
    editor.focus()
    editor.setSelectedRange([0, 4])
    rightClick(editor.element)

    ;(menu()!.querySelector('[data-wryte-action="link"]') as HTMLButtonElement).click()
    const input = menu()!.querySelector('.wryte-context-link-input') as HTMLInputElement
    expect(input).not.toBeNull()

    // In a real browser, focusing the form's input blurs the editor; the menu
    // must not close or the link form vanishes as soon as it opens.
    input.focus()
    editor.editorView.dom.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: input }))
    expect(menu()).not.toBeNull()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(menu()).toBeNull()
  })

  it('closes on Escape', () => {
    const editor = makeEditor()
    rightClick(editor.element)
    expect(menu()).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu()).toBeNull()
  })

  it('closes when clicking outside the menu', () => {
    const editor = makeEditor()
    rightClick(editor.element)
    expect(menu()).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(menu()).toBeNull()
  })

  it('can be disabled via the contextMenu option', () => {
    const editor = makeEditor('some text', { contextMenu: false })
    rightClick(editor.element)
    expect(menu()).toBeNull()
  })
})

describe('bubble follows the editor selection', () => {
  it('shows above a text selection', () => {
    const editor = makeEditor('hello world')
    editor.focus()
    editor.setSelectedRange([0, 5])
    expect(menu()).not.toBeNull()
  })

  it('shows when the caret is in an empty line', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
        ],
      }),
    )
    editor.focus()
    // Place the caret inside the empty paragraph via its PM position.
    const doc = editor.editorView.state.doc
    let emptyPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '' && emptyPos === -1) {
        emptyPos = pos + 1
        return false
      }
    })
    expect(emptyPos).toBeGreaterThan(-1)
    editor.editorView.dispatch(editor.editorView.state.tr.setSelection(TextSelection.create(doc, emptyPos)))

    // An empty line shows an inline (+) button, not a floating popup.
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    expect(plus).not.toBeNull()
    expect(plus!.style.display).not.toBe('none')
    expect(menu()).toBeNull()
  })

  it('shows the block popup when the (+) button is clicked', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    expect(plus).not.toBeNull()

    plus!.click()

    const popup = menu()
    expect(popup).not.toBeNull()
    for (const action of ['attach', 'code', 'quote', 'heading2', 'hr', 'list']) {
      expect(popup!.querySelector(`[data-wryte-block-action="${action}"]`), action).not.toBeNull()
    }
    // The block popup must not contain text formatting.
    expect(popup!.querySelector('[data-wryte-attribute="bold"]')).toBeNull()
    // The (+) hides while the popup is open.
    expect(plus!.style.display).toBe('none')
  })

  it('shows the (+) button again when the block popup is dismissed with Escape', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    expect(plus).not.toBeNull()
    plus!.click()
    expect(menu()).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(menu()).toBeNull()
    expect(plus!.style.display).not.toBe('none')
  })

  it('shows the (+) button again when the block popup is dismissed by clicking outside', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    plus!.click()
    expect(menu()).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    expect(menu()).toBeNull()
    expect(plus!.style.display).not.toBe('none')
  })

  it('opens the block popup on a real mouse sequence (mousedown + click)', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    expect(plus).not.toBeNull()

    // The editor must keep focus across the press so the click still fires.
    plus!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(editor.element.contains(editor.element.ownerDocument!.activeElement)).toBe(true)
    plus!.click()
    expect(menu()).not.toBeNull()
  })

  it('converts the empty line to a code block from the (+) popup', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    plus!.click()

    ;(menu()!.querySelector('[data-wryte-block-action="code"]') as HTMLButtonElement).click()
    expect(editor.attributeIsActive('code')).toBe(true)
  })

  it('mirrors the fileTypes config onto the attach file input', () => {
    const editor = makeEditor('', { fileTypes: ['image/*', 'video/*'] })
    const fileInput = editor.element.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    expect(fileInput!.multiple).toBe(true)
    expect(fileInput!.accept).toBe('image/*,video/*')
    expect(editor.isFileTypeAllowed(new File(['x'], 'clip.mp4', { type: 'video/mp4' }))).toBe(true)
  })

  it('keeps the editor focused on menu button press so actions fire', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    plus!.click()

    // A real browser moves focus to the button on mousedown, which would blur
    // the editor and close the menu before the click. The menu must prevent
    // that (like the (+) button does).
    const codeBtn = menu()!.querySelector('[data-wryte-block-action="code"]') as HTMLButtonElement
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    codeBtn.dispatchEvent(mousedown)
    expect(mousedown.defaultPrevented).toBe(true)
    expect(menu()).not.toBeNull()
  })

  it('applies the block action across a full press sequence', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    plus!.click()

    const codeBtn = menu()!.querySelector('[data-wryte-block-action="code"]') as HTMLButtonElement
    codeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    codeBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    codeBtn.click()
    expect(editor.attributeIsActive('code')).toBe(true)
  })

  it('converts the empty line to a heading from the (+) popup', () => {
    const editor = makeEditor('')
    editor.focus()
    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    plus!.click()

    ;(menu()!.querySelector('[data-wryte-block-action="heading2"]') as HTMLButtonElement).click()
    expect(editor.attributeIsActive('heading2')).toBe(true)
  })

  it('inserts a horizontal rule from the (+) popup', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
        ],
      }),
    )
    editor.focus()
    const doc = editor.editorView.state.doc
    let emptyPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '' && emptyPos === -1) {
        emptyPos = pos + 1
        return false
      }
    })
    editor.editorView.dispatch(editor.editorView.state.tr.setSelection(TextSelection.create(doc, emptyPos)))

    const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
    plus!.click()
    ;(menu()!.querySelector('[data-wryte-block-action="hr"]') as HTMLButtonElement).click()

    expect(menu()).toBeNull()
    expect(editor.toMarkdown()).toBe('first\n\n---\n\nthird')
  })

  it('cycles the block popup list button: paragraph -> bullet -> number -> paragraph', () => {
    const editor = makeEditor('')
    editor.focus()

    const open = (): HTMLButtonElement => {
      const plus = document.querySelector('.wryte-plus-button') as HTMLButtonElement | null
      plus!.click()
      return menu()!.querySelector('[data-wryte-block-action="list"]') as HTMLButtonElement
    }

    const first = open()
    expect(first.classList.contains('is-active')).toBe(false)
    first.click()
    expect(editor.attributeIsActive('bullet')).toBe(true)

    const bullet = open()
    expect(bullet.classList.contains('is-active')).toBe(true)
    bullet.click()
    expect(editor.attributeIsActive('number')).toBe(true)

    const number = open()
    expect(number.classList.contains('is-active')).toBe(true)
    number.click()
    expect(editor.attributeIsActive('bullet')).toBe(false)
    expect(editor.attributeIsActive('number')).toBe(false)
  })

  it('hides when the caret is in a block with text', () => {
    const editor = makeEditor('hello world')
    editor.focus()
    editor.setSelectedRange([0, 5])
    expect(menu()).not.toBeNull()

    editor.setSelectedRange([3, 3])
    expect(menu()).toBeNull()
    const plus = document.querySelector('.wryte-plus-button') as HTMLElement | null
    if (plus) expect(plus.style.display).toBe('none')
  })

  it('closes on blur', () => {
    const editor = makeEditor('hello world')
    editor.focus()
    editor.setSelectedRange([0, 5])
    expect(menu()).not.toBeNull()

    editor.element.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    editor.editorView.dom.dispatchEvent(new FocusEvent('blur'))
    expect(menu()).toBeNull()
  })

  it('opens the image tools bubble over a selected block image', () => {
    const editor = makeEditor('')
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

    expect(editor.editorView.state.selection instanceof NodeSelection).toBe(true)
    const bubble = menu()
    expect(bubble).not.toBeNull()
    for (const action of ['edit', 'trash']) {
      expect(bubble!.querySelector(`[data-wryte-image-action="${action}"]`)).not.toBeNull()
    }
    // The image bubble must not contain text formatting.
    expect(bubble!.querySelector('[data-wryte-attribute="bold"]')).toBeNull()
  })

  it('edits the alt text of a selected image from the image bubble', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', alt: 'old alt', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    editor.focus()
    selectFirstImage(editor)

    ;(menu()!.querySelector('[data-wryte-image-action="edit"]') as HTMLButtonElement).click()
    const input = menu()!.querySelector('.wryte-context-link-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('old alt')

    input.value = 'new alt'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(editor.toMarkdown()).toContain('![new alt](https://example.com/x.png)')
    expect(editor.toMarkdown()).not.toContain('![old alt]')
  })

  it('clears the alt text from the image bubble form', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', alt: 'old alt', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    editor.focus()
    selectFirstImage(editor)

    ;(menu()!.querySelector('[data-wryte-image-action="edit"]') as HTMLButtonElement).click()
    const remove = [...menu()!.querySelectorAll('.wryte-context-item')].find((button) => button.textContent === 'Remove')
    expect(remove).not.toBeUndefined()
    ;(remove as HTMLButtonElement).click()
    expect(editor.toMarkdown()).toContain('![x.png](https://example.com/x.png)')
  })

  it('removes a selected image from the image bubble', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
        ],
      }),
    )
    editor.focus()
    selectFirstImage(editor)

    ;(menu()!.querySelector('[data-wryte-image-action="trash"]') as HTMLButtonElement).click()
    expect(editor.toMarkdown()).toBe('before\n\nafter')
    expect(menu()).toBeNull()
  })

  it('opens the image tools on right-click over a selected image', () => {
    const editor = makeEditor('')
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
    rightClick(editor.element)

    const bubble = menu()
    expect(bubble).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-image-action="edit"]')).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-block-action]')).toBeNull()
  })

  it('switches the format bubble to the image tools when an image is selected', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'select me' }] },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    editor.focus()
    editor.setSelectedRange([0, 9])
    expect(menu()!.querySelector('[data-wryte-attribute="bold"]')).not.toBeNull()

    selectFirstImage(editor)
    const bubble = menu()
    expect(bubble!.querySelector('[data-wryte-image-action="edit"]')).not.toBeNull()
    expect(bubble!.querySelector('[data-wryte-attribute="bold"]')).toBeNull()
  })

  it('closes the image alt form on Escape', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'image',
            attrs: { url: 'https://example.com/x.png', alt: 'old alt', filename: 'x.png', contentType: 'image/png' },
          },
          { type: 'paragraph' },
        ],
      }),
    )
    editor.focus()
    selectFirstImage(editor)

    ;(menu()!.querySelector('[data-wryte-image-action="edit"]') as HTMLButtonElement).click()
    const input = menu()!.querySelector('.wryte-context-link-input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(menu()).toBeNull()
    expect(editor.toMarkdown()).toContain('![old alt](https://example.com/x.png)')
  })

  it('does not open the bubble over a horizontal rule selection', () => {
    const editor = makeEditor('')
    editor.loadDocument(
      schema.nodeFromJSON({
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'horizontal_rule' }, { type: 'paragraph' }],
      }),
    )
    editor.focus()

    const doc = editor.editorView.state.doc
    let hrPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'horizontal_rule' && hrPos === -1) {
        hrPos = pos
        return false
      }
    })
    expect(hrPos).toBeGreaterThan(-1)
    editor.editorView.dispatch(editor.editorView.state.tr.setSelection(NodeSelection.create(doc, hrPos)))

    expect(menu()).toBeNull()
  })
})
