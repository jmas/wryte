import { EventName, dispatchWryteEvent } from './events'
import type { Editor } from './editor'
import { iconMarkup } from './icons'

const label = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  spoiler: 'Spoiler',
  link: 'Link',
  heading2: 'Heading 2',
  quote: 'Quote',
  code: 'Code block',
  list: 'Bulleted list',
  attachFiles: 'Attach files',
  urlPlaceholder: 'https://example.com',
}

export function defaultToolbarHTML(): string {
  return `<div class="wryte-toolbar-row">
    <span class="wryte-toolbar-group">
      <button type="button" class="wryte-toolbar-button" data-wryte-attribute="bold" data-wryte-key="b" title="${label.bold}">${iconMarkup('bold')}</button>
      <button type="button" class="wryte-toolbar-button" data-wryte-attribute="code" title="${label.spoiler}">${iconMarkup('spoiler')}</button>
      <button type="button" class="wryte-toolbar-button" data-wryte-action="link" data-wryte-key="k" title="${label.link}">${iconMarkup('link')}</button>
    </span>
    <span class="wryte-toolbar-group">
      <button type="button" class="wryte-toolbar-button" data-wryte-attribute="heading2" title="${label.heading2}">${iconMarkup('heading2')}</button>
      <button type="button" class="wryte-toolbar-button" data-wryte-attribute="quote" title="${label.quote}">${iconMarkup('quote')}</button>
      <button type="button" class="wryte-toolbar-button" data-wryte-attribute="bullet" title="${label.list}">${iconMarkup('bullet')}</button>
    </span>
    <span class="wryte-toolbar-group">
      <button type="button" class="wryte-toolbar-button" data-wryte-action="attachFiles" title="${label.attachFiles}">${iconMarkup('attach')}</button>
    </span>
  </div>
  <div class="wryte-dialog" data-wryte-dialog hidden>
    <input type="url" data-wryte-dialog-input class="wryte-dialog-input" placeholder="${label.urlPlaceholder}" aria-label="${label.link}" />
    <button type="button" class="wryte-toolbar-button" data-wryte-dialog-apply>Link</button>
    <button type="button" class="wryte-toolbar-button" data-wryte-dialog-unlink>Unlink</button>
  </div>`
}

export function createToolbarElement(): HTMLElement {
  const element = document.createElement('wryte-toolbar')
  element.innerHTML = defaultToolbarHTML()
  return element
}

export class ToolbarController {
  private dialog: HTMLElement | null
  private dialogInput: HTMLInputElement | null
  private fileInput: HTMLInputElement

  constructor(private toolbar: HTMLElement, private editor: Editor) {
    if (!toolbar.querySelector('[data-wryte-attribute],[data-wryte-action]')) {
      toolbar.innerHTML = defaultToolbarHTML()
    }

    this.dialog = toolbar.querySelector('[data-wryte-dialog]')
    this.dialogInput = toolbar.querySelector('[data-wryte-dialog-input]')
    toolbar.querySelector('[data-wryte-dialog-apply]')?.addEventListener('click', () => this.applyLinkDialog())
    toolbar.querySelector('[data-wryte-dialog-unlink]')?.addEventListener('click', () => {
      this.editor.unlink()
      this.hideLinkDialog()
    })
    this.dialogInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.applyLinkDialog()
      if (event.key === 'Escape') this.hideLinkDialog()
    })

    this.fileInput = document.createElement('input')
    this.fileInput.type = 'file'
    this.fileInput.multiple = true
    this.fileInput.hidden = true
    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files?.length) this.editor.insertFiles(this.fileInput.files)
      this.fileInput.value = ''
    })
    toolbar.appendChild(this.fileInput)

    toolbar.addEventListener('click', (event) => this.handleClick(event))
  }

  update(attributes: Record<string, unknown>): void {
    this.toolbar.querySelectorAll('[data-wryte-attribute]').forEach((element) => {
      const name = (element as HTMLElement).dataset.wryteAttribute
      if (name) element.classList.toggle('is-active', !!attributes[name])
    })

    const headingButton = this.toolbar.querySelector('[data-wryte-attribute="heading2"]')
    if (headingButton) {
      const isHeading = !!(attributes.heading2 || attributes.heading3)
      headingButton.innerHTML = iconMarkup(attributes.heading3 ? 'heading3' : 'heading2')
      headingButton.classList.toggle('is-active', isHeading)
    }

    const listButton = this.toolbar.querySelector('[data-wryte-attribute="bullet"]')
    if (listButton) {
      const isNumber = !!attributes.number
      const isList = isNumber || !!attributes.bullet
      listButton.innerHTML = iconMarkup(isNumber ? 'number' : 'bullet')
      listButton.setAttribute('title', isNumber ? 'Numbered list' : label.list)
      listButton.classList.toggle('is-active', isList)
    }

    // The emphasis button combines bold/italic/strike and cycles like the
    // heading button, so its icon must reflect the active inline style.
    const emphasisButton = this.toolbar.querySelector('[data-wryte-attribute="bold"]')
    if (emphasisButton) {
      const isBold = !!attributes.bold
      const isItalic = !!attributes.italic
      const isStrike = !!attributes.strike
      const icon = isStrike ? 'strike' : isItalic ? 'italic' : 'bold'
      emphasisButton.innerHTML = iconMarkup(icon)
      emphasisButton.setAttribute('title', label[isStrike ? 'strike' : isItalic ? 'italic' : 'bold'])
      emphasisButton.classList.toggle('is-active', isBold || isItalic || isStrike)
    }

    // The code/spoiler button combines spoiler and inline code and cycles like
    // the heading button, so its icon must reflect the active style.
    const codeButton = this.toolbar.querySelector('[data-wryte-attribute="code"]')
    if (codeButton) {
      const isCode = !!attributes.code
      const isSpoiler = !!attributes.spoiler
      const icon = isCode ? 'code' : 'spoiler'
      codeButton.innerHTML = iconMarkup(icon)
      codeButton.setAttribute('title', label[isCode ? 'code' : 'spoiler'])
      codeButton.classList.toggle('is-active', isCode || isSpoiler)
    }
  }

  toggleLinkDialog(): void {
    if (!this.dialog) {
      const url = window.prompt('Link URL')
      if (url) this.editor.setLink(url)
      return
    }
    const hidden = this.dialog.hidden
    if (hidden) {
      this.dialog.hidden = false
      if (this.dialogInput) {
        this.dialogInput.value = ''
        this.dialogInput.focus()
      }
      dispatchWryteEvent(this.editor.element, EventName.toolbarDialogShow, {
        editor: this.editor,
        dialogName: 'href',
      })
    } else {
      this.hideLinkDialog()
    }
  }

  hideLinkDialog(): void {
    if (this.dialog) this.dialog.hidden = true
    this.editor.focus()
    dispatchWryteEvent(this.editor.element, EventName.toolbarDialogHide, {
      editor: this.editor,
      dialogName: 'href',
    })
  }

  private applyLinkDialog(): void {
    const value = this.dialogInput?.value.trim()
    if (value) this.editor.setLink(value)
    else this.editor.unlink()
    this.hideLinkDialog()
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest('[data-wryte-attribute],[data-wryte-action]') : null
    if (!target || !this.toolbar.contains(target)) return

    const attribute = (target as HTMLElement).dataset.wryteAttribute
    if (attribute) {
      event.preventDefault()
      this.editor.toggleAttribute(attribute)
      this.editor.focus()
      return
    }

    const action = (target as HTMLElement).dataset.wryteAction
    if (action) {
      event.preventDefault()
      this.invokeAction(action, target as HTMLElement)
    }
  }

  private invokeAction(action: string, invokingElement: HTMLElement): void {
    switch (action) {
      case 'link':
        this.toggleLinkDialog()
        return
      case 'attachFiles':
        this.fileInput.click()
        return
      default:
        if (/^x-./.test(action)) {
          dispatchWryteEvent(this.editor.element, EventName.actionInvoke, {
            editor: this.editor,
            actionName: action,
            invokingElement,
          })
        }
    }
  }
}
