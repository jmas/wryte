import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'
import type { UploadSuccessResult } from '../src/index'
import { createToolbarElement, defaultToolbarHTML } from '../src/toolbar'
import { ICONS, type IconName } from '../src/icons'

function makeToolbarEditor(html = '', value = 'some text'): { editor: Editor; toolbar: HTMLElement } {
  const toolbar = document.createElement('div')
  toolbar.innerHTML = html
  const element = document.createElement('div')
  element.appendChild(toolbar)
  const editor = new Editor(element, { value, toolbar })
  return { editor, toolbar }
}

function click(button: Element): void {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

// jsdom normalizes self-closing tags, so compare the button's rendered icon by
// the path data it contains rather than against the raw `iconMarkup` string.
function showsIcon(button: Element, name: IconName): boolean {
  const d = ICONS[name].match(/d="([^"]*)"/)?.[1] ?? ''
  return button.innerHTML.includes(d)
}

describe('default toolbar markup', () => {
  it('produces the documented shape', () => {
    const html = defaultToolbarHTML()
    expect(html).toContain('data-wryte-attribute="bold"')
    expect(html).toContain('data-wryte-attribute="heading2"')
    expect(html).toContain('data-wryte-action="attachFiles"')
    expect(html).toContain('data-wryte-dialog')
  })

  it('createToolbarElement returns a wryte-toolbar element', () => {
    const element = createToolbarElement()
    expect(element.tagName.toLowerCase()).toBe('wryte-toolbar')
    expect(element.querySelector('[data-wryte-attribute]')).not.toBeNull()
  })
})

describe('ToolbarController', () => {
  it('injects the default toolbar into an empty toolbar element', () => {
    const { toolbar } = makeToolbarEditor('')
    expect(toolbar.querySelector('[data-wryte-attribute="bold"]')).not.toBeNull()
    expect(toolbar.querySelector('[data-wryte-action="attachFiles"]')).not.toBeNull()
  })

  it('keeps a custom toolbar without injecting extra buttons', () => {
    const { toolbar } = makeToolbarEditor('<button type="button" data-wryte-attribute="bold">B</button>')
    expect(toolbar.querySelectorAll('[data-wryte-attribute],[data-wryte-action]')).toHaveLength(1)
    expect(toolbar.querySelector('[data-wryte-action="attachFiles"]')).toBeNull()
  })

  it('applies attributes on button click', () => {
    const { editor, toolbar } = makeToolbarEditor()
    editor.setSelectedRange([0, 4])
    click(toolbar.querySelector('[data-wryte-attribute="bold"]')!)
    expect(editor.toMarkdown()).toBe('**some** text')
  })

  it('reflects the active attribute on the button', () => {
    const { editor, toolbar } = makeToolbarEditor()
    editor.loadMarkdown('**bold** text')
    editor.setSelectedRange([0, 6])
    const button = toolbar.querySelector('[data-wryte-attribute="bold"]')!
    expect(button.classList.contains('is-active')).toBe(true)
  })

  it('swaps the heading button between H2 and H3', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const button = toolbar.querySelector('[data-wryte-attribute="heading2"]')!
    editor.setSelectedRange([0, 0])
    editor.toggleAttribute('heading2')
    expect(showsIcon(button, 'heading2')).toBe(true)
    expect(button.classList.contains('is-active')).toBe(true)
    editor.toggleAttribute('heading2')
    expect(showsIcon(button, 'heading3')).toBe(true)
    editor.toggleAttribute('heading2')
    expect(button.classList.contains('is-active')).toBe(false)
  })

  it('swaps the list button between bullet and number', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const button = toolbar.querySelector('[data-wryte-attribute="bullet"]')!
    editor.setSelectedRange([0, 0])
    editor.toggleAttribute('bullet')
    expect(showsIcon(button, 'bullet')).toBe(true)
    expect(button.classList.contains('is-active')).toBe(true)
    editor.toggleAttribute('bullet')
    expect(showsIcon(button, 'number')).toBe(true)
    expect(button.getAttribute('title')).toBe('Numbered list')
    editor.toggleAttribute('bullet')
    expect(button.classList.contains('is-active')).toBe(false)
  })

  it('swaps the emphasis button between bold, italic and strike', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const button = toolbar.querySelector('[data-wryte-attribute="bold"]')!
    editor.setSelectedRange([0, 9])
    editor.toggleAttribute('bold')
    expect(showsIcon(button, 'bold')).toBe(true)
    editor.toggleAttribute('bold')
    expect(showsIcon(button, 'italic')).toBe(true)
    editor.toggleAttribute('bold')
    expect(showsIcon(button, 'strike')).toBe(true)
    expect(button.classList.contains('is-active')).toBe(true)
  })

  it('swaps the code/spoiler button between spoiler and code', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const button = toolbar.querySelector('[data-wryte-attribute="code"]')!
    editor.setSelectedRange([0, 4])
    editor.toggleAttribute('code')
    expect(showsIcon(button, 'spoiler')).toBe(true)
    editor.toggleAttribute('code')
    expect(showsIcon(button, 'code')).toBe(true)
  })

  it('opens the link dialog from the link action and fires wryte-toolbar-dialog-show', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const shown: string[] = []
    editor.element.addEventListener('wryte-toolbar-dialog-show', () => shown.push('show'))
    const dialog = toolbar.querySelector('[data-wryte-dialog]') as HTMLElement
    expect(dialog.hidden).toBe(true)
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    expect(shown).toEqual(['show'])
    expect(dialog.hidden).toBe(false)
    const input = toolbar.querySelector('[data-wryte-dialog-input]') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('applies a link from the dialog and fires wryte-toolbar-dialog-hide', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const hidden: string[] = []
    editor.element.addEventListener('wryte-toolbar-dialog-hide', () => hidden.push('hide'))
    editor.setSelectedRange([0, 4])
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    const input = toolbar.querySelector('[data-wryte-dialog-input]') as HTMLInputElement
    input.value = 'https://example.com'
    click(toolbar.querySelector('[data-wryte-dialog-apply]')!)
    expect(editor.toMarkdown()).toBe('[some](https://example.com) text')
    expect(hidden).toEqual(['hide'])
  })

  it('applies a link from the dialog with Enter', () => {
    const { editor, toolbar } = makeToolbarEditor()
    editor.setSelectedRange([0, 4])
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    const input = toolbar.querySelector('[data-wryte-dialog-input]') as HTMLInputElement
    input.value = 'https://example.com'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(editor.toMarkdown()).toBe('[some](https://example.com) text')
  })

  it('unlinks from the dialog unlink button', () => {
    const { editor, toolbar } = makeToolbarEditor('[some](https://example.com) text')
    editor.setSelectedRange([0, 4])
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    click(toolbar.querySelector('[data-wryte-dialog-unlink]')!)
    expect(editor.toMarkdown()).toBe('some text')
  })

  it('closes the link dialog on Escape', () => {
    const { toolbar } = makeToolbarEditor()
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    const dialog = toolbar.querySelector('[data-wryte-dialog]') as HTMLElement
    const input = toolbar.querySelector('[data-wryte-dialog-input]') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(dialog.hidden).toBe(true)
  })

  it('removes a link when the dialog is applied empty', () => {
    const { editor, toolbar } = makeToolbarEditor('[some](https://example.com) text')
    editor.setSelectedRange([0, 4])
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    click(toolbar.querySelector('[data-wryte-dialog-apply]')!)
    expect(editor.toMarkdown()).toBe('some text')
  })

  it('toggles the link dialog on repeated clicks', () => {
    const { toolbar } = makeToolbarEditor()
    const dialog = toolbar.querySelector('[data-wryte-dialog]') as HTMLElement
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    expect(dialog.hidden).toBe(false)
    click(toolbar.querySelector('[data-wryte-action="link"]')!)
    expect(dialog.hidden).toBe(true)
  })

  it('inserts files chosen from the hidden file input', () => {
    const { editor, toolbar } = makeToolbarEditor()
    const requested: string[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { file: File; respond: (r: UploadSuccessResult) => void }
      requested.push(detail.file.name)
      detail.respond({ url: 'https://cdn.example.com/' + detail.file.name })
    })
    const end = editor.toMarkdown().length
    editor.setSelectedRange([end, end])
    click(toolbar.querySelector('[data-wryte-action="attachFiles"]')!)
    const fileInput = toolbar.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    Object.defineProperty(fileInput!, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })] })
    fileInput!.dispatchEvent(new Event('change'))
    expect(requested).toEqual(['a.png'])
    expect(editor.toMarkdown()).toBe('some text\n\n![a.png](https://cdn.example.com/a.png)')
  })

  it('dispatches wryte-action-invoke for custom x-* actions', () => {
    const { editor, toolbar } = makeToolbarEditor('<button type="button" data-wryte-action="x-export">Export</button>')
    const invokes: Array<{ actionName: string; invokingElement: HTMLElement }> = []
    editor.element.addEventListener('wryte-action-invoke', (event) => {
      invokes.push((event as CustomEvent).detail)
    })
    const button = toolbar.querySelector('[data-wryte-action="x-export"]')!
    click(button)
    expect(invokes).toHaveLength(1)
    expect(invokes[0].actionName).toBe('x-export')
    expect(invokes[0].invokingElement).toBe(button)
  })

  it('ignores unknown action names', () => {
    const { editor, toolbar } = makeToolbarEditor('<button type="button" data-wryte-action="nope">Nope</button>')
    const invokes: number[] = []
    editor.element.addEventListener('wryte-action-invoke', () => invokes.push(1))
    click(toolbar.querySelector('[data-wryte-action="nope"]')!)
    expect(invokes).toHaveLength(0)
  })
})
