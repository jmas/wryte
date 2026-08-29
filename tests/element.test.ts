import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '../src/index'

function makeElement(html = '<wryte-editor></wryte-editor>'): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('wryte-editor custom element', () => {
  it('auto-registers on import', () => {
    expect(customElements.get('wryte-editor')).toBeTypeOf('function')
    expect(customElements.get('wryte-toolbar')).toBeTypeOf('function')
  })

  it('creates an Editor on connect', () => {
    const wrapper = makeElement()
    const element = wrapper.querySelector('wryte-editor')!
    expect((element as unknown as { editor: Editor | null }).editor).toBeInstanceOf(Editor)
  })

  it('reads its initial value from the value attribute', () => {
    const wrapper = makeElement('<wryte-editor value="# Hello"></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')!
    const editor = (element as unknown as { editor: Editor }).editor
    expect(editor.toMarkdown()).toBe('## Hello')
    expect((element as unknown as { value: string }).value).toBe('## Hello')
  })

  it('loads markdown through the value property', () => {
    const wrapper = makeElement()
    const element = wrapper.querySelector('wryte-editor')! as unknown as { value: string; editor: Editor }
    element.value = '**bold** text'
    expect(element.editor.toMarkdown()).toBe('**bold** text')
    expect(element.value).toBe('**bold** text')
  })

  it('does not create a toolbar by default', () => {
    const wrapper = makeElement()
    expect(wrapper.querySelector('wryte-toolbar')).toBeNull()
  })

  it('wires an explicitly provided toolbar without moving it', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<wryte-editor toolbar="my-toolbar"></wryte-editor>'
    const toolbar = document.createElement('div')
    toolbar.id = 'my-toolbar'
    toolbar.innerHTML =
      '<button type="button" data-wryte-attribute="bold">B</button><button type="button" data-wryte-action="attachFiles">Attach</button>'
    wrapper.appendChild(toolbar)
    document.body.appendChild(wrapper)

    const editor = (wrapper.querySelector('wryte-editor')! as unknown as { editor: Editor }).editor!
    // The editor must not have moved the toolbar or inserted anything new.
    expect(toolbar.parentNode).toBe(wrapper)

    editor.loadMarkdown('text')
    editor.setSelectedRange([0, 4])
    toolbar.querySelector('[data-wryte-attribute="bold"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(editor.toMarkdown()).toBe('**text**')
  })

  it('supports the placeholder attribute', () => {
    const wrapper = makeElement('<wryte-editor placeholder="Type here"></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')!
    expect(element.getAttribute('data-wryte-placeholder')).toBe('Type here')
  })

  it('flags an empty document so the placeholder can show', () => {
    const wrapper = makeElement('<wryte-editor placeholder="Type here"></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as HTMLElement & { editor: Editor }

    expect(element.hasAttribute('data-wryte-empty')).toBe(true)
    element.editor.loadMarkdown('some content')
    expect(element.hasAttribute('data-wryte-empty')).toBe(false)

    element.editor.clear()
    expect(element.hasAttribute('data-wryte-empty')).toBe(true)
  })

  it('autofocuses when the autofocus attribute is present', () => {
    const wrapper = makeElement('<wryte-editor autofocus></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as { autofocus: boolean; editor: Editor }
    expect(element.autofocus).toBe(true)
    expect(element.editor.options.autofocus).toBe(true)
  })

  it('honors autofocus="false" as disabled', () => {
    const wrapper = makeElement('<wryte-editor autofocus="false"></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as { autofocus: boolean; editor: Editor }
    expect(element.autofocus).toBe(false)
    expect(element.editor.options.autofocus).toBe(false)
  })

  it('reflects the autofocus property to the attribute', () => {
    const wrapper = makeElement()
    const element = wrapper.querySelector('wryte-editor')! as unknown as { autofocus: boolean }
    expect(element.autofocus).toBe(false)
    element.autofocus = true
    expect(element.autofocus).toBe(true)
    element.autofocus = false
    expect(element.autofocus).toBe(false)
  })

  it('supports disable/enable via the disabled attribute', () => {
    const wrapper = makeElement('<wryte-editor disabled></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as { disabled: boolean; editor: Editor }
    expect(element.disabled).toBe(true)
    expect(element.editor.options.editable).toBe(false)
    element.disabled = false
    expect(element.editor.options.editable).toBe(true)
  })

  it('supports readonly via the readonly attribute', () => {
    const wrapper = makeElement('<wryte-editor readonly></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as { readonly: boolean; editor: Editor }
    expect(element.readonly).toBe(true)
    expect(element.editor.readonly).toBe(true)
    expect(element.editor.editorView.editable).toBe(false)
    // Read-only never touches the editable flag (unlike disabled).
    expect(element.editor.options.editable).toBe(true)
  })

  it('reflects the readonly property to the attribute', () => {
    const wrapper = makeElement()
    const element = wrapper.querySelector('wryte-editor')! as unknown as HTMLElement & { readonly: boolean; editor: Editor }
    expect(element.readonly).toBe(false)
    element.readonly = true
    expect(element.hasAttribute('readonly')).toBe(true)
    expect(element.editor.editorView.editable).toBe(false)
    element.readonly = false
    expect(element.hasAttribute('readonly')).toBe(false)
    expect(element.editor.editorView.editable).toBe(true)
  })

  it('initializes from an input element and syncs back to it', () => {
    const wrapper = makeElement(`
      <input type="hidden" id="content" value="# from input" />
      <wryte-editor input="content"></wryte-editor>
    `)
    const element = wrapper.querySelector('wryte-editor')!
    const input = wrapper.querySelector('#content') as HTMLInputElement
    const editor = (element as unknown as { editor: Editor }).editor
    expect(editor.toMarkdown()).toBe('## from input')
    const end = editor.toMarkdown().length
    editor.setSelectedRange([end, end])
    editor.insertString(' plus')
    expect(input.value).toBe('## from input plus')
  })

  it('takes the value attribute over the input element', () => {
    const wrapper = makeElement(`
      <input type="hidden" id="content" value="# from input" />
      <wryte-editor input="content" value="# from attribute"></wryte-editor>
    `)
    const editor = (wrapper.querySelector('wryte-editor')! as unknown as { editor: Editor }).editor
    expect(editor.toMarkdown()).toBe('## from attribute')
  })

  it('parses the abilities attribute into a whitelist', () => {
    const wrapper = makeElement('<wryte-editor abilities="bold, italic, quote"></wryte-editor>')
    const editor = (wrapper.querySelector('wryte-editor')! as unknown as { editor: Editor }).editor
    expect(editor.options.abilities).toEqual(['bold', 'italic', 'quote'])
    expect(editor.abilityEnabled('bold')).toBe(true)
    expect(editor.abilityEnabled('link')).toBe(false)
  })

  it('ignores unknown abilities in the abilities attribute', () => {
    const wrapper = makeElement('<wryte-editor abilities="bold, underline, nope"></wryte-editor>')
    const editor = (wrapper.querySelector('wryte-editor')! as unknown as { editor: Editor }).editor
    expect(editor.options.abilities).toEqual(['bold'])
  })

  it('parses the filetypes attribute into a whitelist', () => {
    const wrapper = makeElement('<wryte-editor filetypes="image/*, video/*, .pdf"></wryte-editor>')
    const editor = (wrapper.querySelector('wryte-editor')! as unknown as { editor: Editor }).editor
    expect(editor.options.fileTypes).toEqual(['image/*', 'video/*', '.pdf'])
    expect(editor.isFileTypeAllowed(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(editor.isFileTypeAllowed(new File(['x'], 'b.mp3', { type: 'audio/mpeg' }))).toBe(false)
  })

  it('leaves fileTypes null when the attribute is absent', () => {
    const wrapper = makeElement()
    const editor = (wrapper.querySelector('wryte-editor')! as unknown as { editor: Editor }).editor
    expect(editor.options.fileTypes).toBeNull()
  })
})

describe('value accessor and form fallback', () => {
  it('does not shadow an element that already exposes a value accessor', () => {
    class MyEditor extends HTMLElement {
      get value(): string {
        return 'prototype-value'
      }
    }
    customElements.define('test-value-accessor', MyEditor)
    const element = document.createElement('test-value-accessor')
    const editor = new Editor(element, { toolbar: false, value: 'content' })
    expect((element as unknown as { value: string }).value).toBe('prototype-value')
    expect(editor.toMarkdown()).toBe('content')
  })

  it('mirrors the value into a hidden input inside the form (fallback wiring)', () => {
    const form = document.createElement('form')
    form.innerHTML = '<wryte-editor name="content" value="# Hi"></wryte-editor>'
    document.body.appendChild(form)
    const element = form.querySelector('wryte-editor')!
    const hidden = form.querySelector('input[type="hidden"][name="content"]') as HTMLInputElement
    expect(hidden).not.toBeNull()
    expect(hidden.value).toBe('## Hi')
    const editor = (element as unknown as { editor: Editor }).editor
    const end = editor.toMarkdown().length
    editor.setSelectedRange([end, end])
    editor.insertString('!')
    expect(hidden.value).toBe('## Hi!')
    form.remove()
  })
})

describe('form association', () => {
  it('reports its containing form', () => {
    const wrapper = document.createElement('form')
    wrapper.innerHTML = '<wryte-editor name="content" value="# Hi"></wryte-editor>'
    document.body.appendChild(wrapper)
    const element = wrapper.querySelector('wryte-editor')! as unknown as { form: HTMLFormElement | null }
    expect(element.form).toBe(wrapper)
  })

  it('tracks validity for required fields', () => {
    const wrapper = makeElement('<wryte-editor required></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as {
      checkValidity: () => boolean
      setCustomValidity: (message: string) => void
      value: string
    }
    expect(element.checkValidity()).toBe(false)
    element.value = 'filled'
    expect(element.checkValidity()).toBe(true)
    element.setCustomValidity('nope')
    expect(element.checkValidity()).toBe(false)
    element.setCustomValidity('')
    expect(element.checkValidity()).toBe(true)
  })
})
