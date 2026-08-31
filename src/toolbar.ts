import { EventName, dispatchWryteEvent } from './events'
import type { Editor } from './editor'
import { acceptAttribute } from './upload'
import { iconMarkup, type IconName } from './icons'

const label = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  spoiler: 'Spoiler',
  code: 'Code',
  link: 'Link',
  heading2: 'Heading 2',
  quote: 'Quote',
  list: 'Bulleted list',
  attachFiles: 'Attach files',
  urlPlaceholder: 'https://example.com',
}

function toolbarLabel(attribute: string): string {
  switch (attribute) {
    case 'bold':
      return label.bold
    case 'italic':
      return label.italic
    case 'strike':
      return label.strike
    case 'spoiler':
      return label.spoiler
    case 'code':
      return label.code
    default:
      return attribute
  }
}

// One toolbar button per attribute. A grouped button is keyed on its first
// member; clicking it cycles through the group (via `toggleAttribute`), so the
// group as a whole occupies a single button.
function attributeButtonHTML(attribute: string): string {
  const key = attribute === 'bold' ? ' data-wryte-key="b"' : ''
  return `<button type="button" class="wryte-toolbar-button" data-wryte-attribute="${attribute}"${key} title="${toolbarLabel(attribute)}">${iconMarkup(attribute as IconName)}</button>`
}

// Inline-formatting buttons for the default toolbar: each configured
// `attributeGroups` group collapses into one cycling button, every other
// inline attribute gets its own separate toggle button.
function inlineButtonsHTML(attributeGroups: string[][]): string {
  const inlineNames = ['bold', 'italic', 'strike', 'spoiler', 'code']
  const buttons: string[] = []
  const grouped = new Set<string>()
  for (const name of inlineNames) {
    if (grouped.has(name)) continue
    const group = attributeGroups.find((entry) => entry.includes(name))
    if (group) {
      for (const member of group) grouped.add(member)
      buttons.push(attributeButtonHTML(group[0]))
    } else {
      grouped.add(name)
      buttons.push(attributeButtonHTML(name))
    }
  }
  return buttons.join('\n      ')
}

export function defaultToolbarHTML(attributeGroups: string[][] = []): string {
  return `<div class="wryte-toolbar-row">
    <span class="wryte-toolbar-group">
      ${inlineButtonsHTML(attributeGroups)}
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

export function createToolbarElement(attributeGroups: string[][] = []): HTMLElement {
  const element = document.createElement('wryte-toolbar')
  element.innerHTML = defaultToolbarHTML(attributeGroups)
  return element
}

export class ToolbarController {
  private dialog: HTMLElement | null
  private dialogInput: HTMLInputElement | null
  private fileInput: HTMLInputElement

  constructor(private toolbar: HTMLElement, private editor: Editor) {
    if (!toolbar.querySelector('[data-wryte-attribute],[data-wryte-action]')) {
      toolbar.innerHTML = defaultToolbarHTML(editor.options.attributeGroups ?? [])
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
    this.fileInput.accept = acceptAttribute(editor.options.fileTypes)
    this.fileInput.hidden = true
    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files?.length) this.editor.insertFiles(this.fileInput.files)
      this.fileInput.value = ''
    })
    toolbar.appendChild(this.fileInput)

    toolbar.addEventListener('click', this.handleToolbarClick)
  }

  destroy(): void {
    this.fileInput.remove()
    this.toolbar.removeEventListener('click', this.handleToolbarClick)
  }

  private handleToolbarClick = (event: MouseEvent): void => {
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

  update(attributes: Record<string, unknown>): void {
    this.toolbar.querySelectorAll('[data-wryte-attribute]').forEach((element) => {
      const name = (element as HTMLElement).dataset.wryteAttribute
      if (!name) return
      if (name === 'heading2') {
        this.updateHeadingButton(element as HTMLButtonElement, attributes)
      } else if (name === 'bullet') {
        this.updateListButton(element as HTMLButtonElement, attributes)
      } else if (this.editor.attributeGroup(name)) {
        this.updateGroupButton(element as HTMLButtonElement, this.editor.attributeGroup(name)!, attributes)
      } else {
        element.classList.toggle('is-active', !!attributes[name])
      }
    })

    // The link button reflects the link mark like the bubble.
    this.toolbar.querySelectorAll('[data-wryte-action="link"]').forEach((element) => {
      element.classList.toggle('is-active', !!attributes.href)
    })
  }

  // The heading button cycles paragraph -> H2 -> H3 -> paragraph, so its icon
  // must reflect the current block: the H2 glyph by default, the H3 glyph
  // while in a heading 3.
  private updateHeadingButton(button: HTMLButtonElement, attributes: Record<string, unknown>): void {
    const isHeading = !!(attributes.heading2 || attributes.heading3)
    button.innerHTML = iconMarkup(attributes.heading3 ? 'heading3' : 'heading2')
    button.classList.toggle('is-active', isHeading)
  }

  // The list button cycles paragraph -> bullet -> number -> paragraph, so its
  // icon must reflect the current list type: bullet by default, numeral while
  // a numbered list is active.
  private updateListButton(button: HTMLButtonElement, attributes: Record<string, unknown>): void {
    const isNumber = !!attributes.number
    const isList = isNumber || !!attributes.bullet
    button.innerHTML = iconMarkup(isNumber ? 'number' : 'bullet')
    button.setAttribute('title', isNumber ? 'Numbered list' : label.list)
    button.classList.toggle('is-active', isList)
  }

  // A group button cycles through its members, so its icon must reflect the
  // active style: the currently-active member's glyph, or the first member's
  // when none is active.
  private updateGroupButton(button: HTMLButtonElement, group: string[], attributes: Record<string, unknown>): void {
    const active = group.find((name) => !!attributes[name])
    const current = active ?? group[0]
    button.innerHTML = iconMarkup(current as IconName)
    const title = toolbarLabel(current)
    button.title = title
    button.setAttribute('aria-label', title)
    button.classList.toggle('is-active', active != null)
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
