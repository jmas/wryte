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

  it('supports disable/enable via the disabled attribute', () => {
    const wrapper = makeElement('<wryte-editor disabled></wryte-editor>')
    const element = wrapper.querySelector('wryte-editor')! as unknown as { disabled: boolean; editor: Editor }
    expect(element.disabled).toBe(true)
    expect(element.editor.options.editable).toBe(false)
    element.disabled = false
    expect(element.editor.options.editable).toBe(true)
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
