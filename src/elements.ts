import { Editor } from './editor'
import type { EditorOptions } from './editor'
import { ALL_ABILITIES } from './editor'

let toolbarElementDefined = false
let editorElementDefined = false
let baseStylesInjected = false

function injectBaseStyles(): void {
  if (baseStylesInjected || typeof document === 'undefined') return
  baseStylesInjected = true
  const style = document.createElement('style')
  style.textContent = 'wryte-editor{display:block}'
  document.head.appendChild(style)
}

export function registerToolbarElement(name = 'wryte-toolbar'): void {
  if (typeof customElements === 'undefined') return
  if (toolbarElementDefined || customElements.get(name)) return
  toolbarElementDefined = true
  class WryteToolbarElement extends HTMLElement {}
  customElements.define(name, WryteToolbarElement)
}

function attachUsableInternals(element: HTMLElement): ElementInternals | null {
  if (typeof window === 'undefined' || !('ElementInternals' in window)) return null
  try {
    const internals = element.attachInternals()
    if (
      typeof internals.setValidity === 'function' &&
      typeof internals.checkValidity === 'function' &&
      typeof internals.setFormValue === 'function'
    ) {
      return internals
    }
  } catch {
    // attachInternals unavailable or rejected
  }
  return null
}

export function registerEditorElement(name = 'wryte-editor'): void {
  if (typeof customElements === 'undefined') return
  if (editorElementDefined || customElements.get(name)) return
  editorElementDefined = true
  injectBaseStyles()
  registerToolbarElement()

  class WryteEditorElement extends HTMLElement {
    static formAssociated = typeof window !== 'undefined' && 'ElementInternals' in window

    #internals: ElementInternals | null = null
    #hiddenInput: HTMLInputElement | null = null
    #editor: Editor | null = null
    #defaultValue = ''
    #customError = ''

    constructor() {
      super()
      this.#internals = attachUsableInternals(this)
    }

    connectedCallback(): void {
      if (this.#editor) return

      this.#defaultValue = this.initialValue()
      const options: EditorOptions = { value: this.#defaultValue }
      if (this.hasAttribute('placeholder')) options.placeholder = this.getAttribute('placeholder') ?? undefined
      if (this.hasAttribute('toolbar')) options.toolbar = this.getAttribute('toolbar') ?? undefined
      if (this.autofocus) options.autofocus = true
      if (this.hasAttribute('abilities')) {
        // Comma-separated whitelist, e.g. `abilities="bold, italic, link"`.
        options.abilities = (this.getAttribute('abilities') ?? '')
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry): entry is (typeof ALL_ABILITIES)[number] => (ALL_ABILITIES as readonly string[]).includes(entry))
      }
      if (this.hasAttribute('filetypes')) {
        // Comma-separated MIME types / wildcards / extensions, e.g.
        // `filetypes="image/*, video/*, .pdf"`. Omitted = any file.
        options.fileTypes = (this.getAttribute('filetypes') ?? '')
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      }

      this.#editor = new Editor(this, options)
      if (this.hasAttribute('disabled')) this.#editor.disable()
      if (this.hasAttribute('readonly')) this.#editor.readonly = true

      this.ensureHiddenInput()
      this.addEventListener('wryte-change', this.syncFormValue)
      this.syncFormValue()
    }

    disconnectedCallback(): void {
      this.removeEventListener('wryte-change', this.syncFormValue)
    }

    get editor(): Editor | null {
      return this.#editor
    }

    get value(): string {
      if (this.#editor) return this.#editor.toMarkdown()
      return this.getAttribute('value') ?? this.#defaultValue
    }

    set value(value: string) {
      this.#defaultValue = value ?? ''
      if (this.#editor) {
        this.#editor.loadMarkdown(value ?? '')
      } else {
        this.setAttribute('value', value ?? '')
      }
      this.syncFormValue()
    }

    get name(): string {
      return this.getAttribute('name') ?? ''
    }

    set name(value: string) {
      this.setAttribute('name', value ?? '')
      this.ensureHiddenInput()
    }

    get disabled(): boolean {
      return this.hasAttribute('disabled')
    }

    set disabled(value: boolean) {
      this.toggleAttribute('disabled', !!value)
      if (this.#editor) {
        if (value) this.#editor.disable()
        else this.#editor.enable()
      }
      this.syncFormValue()
    }

    // Read-only mode: the editor stays focusable/selectable/copyable but cannot
    // be edited. Unlike `disabled` it never suppresses the form value.
    get readonly(): boolean {
      return this.hasAttribute('readonly')
    }

    set readonly(value: boolean) {
      this.toggleAttribute('readonly', !!value)
      if (this.#editor) this.#editor.readonly = value
    }

    // Autofocus honors an explicit "false" value, so `autofocus="false"`
    // disables it (presence-only semantics would treat that as on).
    get autofocus(): boolean {
      return this.getAttribute('autofocus') != null && this.getAttribute('autofocus') !== 'false'
    }

    set autofocus(value: boolean) {
      if (value) this.setAttribute('autofocus', '')
      else this.setAttribute('autofocus', 'false')
      if (this.#editor && value) this.#editor.focus()
    }

    get form(): HTMLFormElement | null {
      if (this.#internals && this.#internals.form) return this.#internals.form
      return this.closest('form') as HTMLFormElement | null
    }

    checkValidity(): boolean {
      if (this.#internals) return this.#internals.checkValidity()
      const required = this.hasAttribute('required')
      return !(required && this.value.trim() === '') && this.#customError === ''
    }

    setCustomValidity(message: string): void {
      this.#customError = message ?? ''
      this.syncFormValue()
    }

    formResetCallback(): void {
      this.value = this.#defaultValue
    }

    formDisabledCallback(disabled: boolean): void {
      this.disabled = disabled
    }

    private initialValue(): string {
      const attribute = this.getAttribute('value')
      if (attribute != null) return attribute
      const input = this.inputElement
      if (input) return input.value ?? ''
      return this.textContent ?? ''
    }

    private get inputElement(): HTMLInputElement | null {
      const id = this.getAttribute('input')
      if (!id) return null
      return this.ownerDocument?.getElementById(id) as HTMLInputElement | null
    }

    // Fallback form wiring when ElementInternals is unusable: mirror the value
    // into a hidden input inside the containing form, Trix-style.
    private ensureHiddenInput(): void {
      if (this.#internals || this.#hiddenInput || this.inputElement) return
      const name = this.getAttribute('name')
      if (!name) return
      const form = this.closest('form')
      if (!form) return
      this.#hiddenInput = this.ownerDocument!.createElement('input')
      this.#hiddenInput.type = 'hidden'
      this.#hiddenInput.name = name
      form.appendChild(this.#hiddenInput)
    }

    private syncFormValue = (): void => {
      const value = this.#editor ? this.#editor.toMarkdown() : this.value
      if (this.#internals) {
        const required = this.hasAttribute('required')
        const valueMissing = required && value.trim() === ''
        const customError = this.#customError !== ''
        this.#internals.setValidity({ valueMissing, customError }, this.#customError)
        this.#internals.setFormValue(this.disabled ? '' : value)
      } else if (this.#hiddenInput) {
        this.#hiddenInput.value = value
      }
      const input = this.inputElement
      if (input) input.value = value
    }
  }

  customElements.define(name, WryteEditorElement)
}

export function registerElement(name = 'wryte-editor'): void {
  registerEditorElement(name)
}

// Trix registers its elements on load; wryte does the same so `<wryte-editor>`
// works without any explicit setup.
if (typeof customElements !== 'undefined') {
  registerEditorElement()
}
