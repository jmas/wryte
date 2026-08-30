import { NodeSelection, type EditorState } from 'prosemirror-state'
import type { Editor } from './editor'
import { acceptAttribute } from './upload'
import { iconMarkup, type IconName } from './icons'

const LABELS: Record<string, string> = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  spoiler: 'Spoiler',
  code: 'Code block',
  link: 'Link',
  heading2: 'Heading 2',
  quote: 'Quote',
  bullet: 'Bulleted list',
  number: 'Numbered list',
  attach: 'Insert attachment',
  hr: 'Horizontal rule',
  edit: 'Edit alt text',
  trash: 'Remove image',
}

let stylesInjected = false

function ensureStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
.wryte-context-menu {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  background: var(--wryte-surface, #ffffff);
  border: 1px solid var(--wryte-border, #e6e6e6);
  border-radius: 8px;
  padding: 4px;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--wryte-text, #1d1d1f);
  -webkit-user-select: none;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 1px;
}
.wryte-context-item {
  font: inherit;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--wryte-text, #1d1d1f);
}
.wryte-context-item--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  padding: 0;
  border-radius: 4px;
}
.wryte-context-item--icon svg {
  display: block;
}
.wryte-context-item:hover,
.wryte-context-item:focus-visible {
  background: var(--wryte-hover, #f3f4f6);
  outline: none;
}
.wryte-context-item:disabled {
  opacity: 0.4;
  cursor: default;
}
.wryte-context-item--icon.is-active {
  background: var(--wryte-accent, #2563eb);
  color: var(--wryte-accent-contrast, #ffffff);
}
.wryte-context-item--icon.is-active:hover:not(:disabled) {
  background: var(--wryte-accent, #2563eb);
}
.wryte-context-divider {
  width: 1px;
  height: 20px;
  background: var(--wryte-divider, #e5e7eb);
  margin: 0 4px;
}
.wryte-context-menu--link {
  border-radius: 8px;
  gap: 4px;
  padding: 6px;
}
.wryte-context-link-input {
  flex: 1;
  min-width: 180px;
  font: inherit;
  padding: 4px 6px;
  border: 1px solid var(--wryte-border-strong, #d1d5db);
  border-radius: 4px;
  background: var(--wryte-surface, #ffffff);
  color: var(--wryte-text, #1d1d1f);
}
.wryte-plus-button {
  position: absolute;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--wryte-border-strong, #d1d5db);
  background: var(--wryte-surface, #ffffff);
  color: var(--wryte-text-muted, #6b7280);
  cursor: pointer;
  z-index: 10;
}
.wryte-plus-button:hover {
  color: var(--wryte-accent, #2563eb);
  border-color: var(--wryte-accent, #2563eb);
}`
  document.head.appendChild(style)
}

type MenuMode = 'format' | 'block' | 'image'
type Anchor = 'selection' | 'block'

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

// Formatting UI that follows the editor:
// - text selected  -> formatting bubble above the selection
// - caret in an empty line -> inline (+) button on the right of the line;
//   clicking it opens a block-insertion popup (attachment, code, quote,
//   heading, lists)
// Right-click is deliberately not handled: the browser's native context menu
// always shows. The wryte popup only appears for a text selection or the (+)
// button.
export class ContextMenuController {
  private menu: HTMLElement | null = null
  private anchor: Anchor | null = null
  private plusButton: HTMLButtonElement | null = null
  private plusPositionRaf: number | null = null
  private plusFontsListenerAttached = false
  private fileInput: HTMLInputElement | null = null
  private suppressNextFocusOpen = false

  constructor(private editor: Editor) {
    ensureStyles()

    this.fileInput = document.createElement('input')
    this.fileInput.type = 'file'
    this.fileInput.multiple = true
    this.fileInput.accept = acceptAttribute(editor.options.fileTypes)
    this.fileInput.hidden = true
    this.fileInput.addEventListener('change', this.handleFiles)
    editor.element.appendChild(this.fileInput)

    const element = editor.element
    element.addEventListener('wryte-selection-change', this.handleSelectionChange)
    element.addEventListener('wryte-focus', this.handleFocus)
    element.addEventListener('focusout', this.handleFocusOut)
  }

  destroy(): void {
    this.close()
    this.hidePlusButton()
    this.plusButton?.remove()
    this.plusButton = null
    this.fileInput?.remove()
    this.fileInput = null
    const element = this.editor.element
    element.removeEventListener('wryte-selection-change', this.handleSelectionChange)
    element.removeEventListener('wryte-focus', this.handleFocus)
    element.removeEventListener('focusout', this.handleFocusOut)
  }

  // --- Selection-driven behavior ---

  private handleFocus = (): void => {
    // Closing the image alt form on Escape refocuses the editor, which would
    // immediately re-open the image bubble over the still-selected image.
    // Swallow that one refocus so Escape actually dismisses the menu.
    if (this.suppressNextFocusOpen) {
      this.suppressNextFocusOpen = false
      return
    }
    this.handleSelectionChange()
  }

  private handleFocusOut = (event: FocusEvent): void => {
    // The link form gives its input focus, which blurs the editor and fires
    // this handler. Keep the menu open while focus moves inside it (the input
    // or its apply/remove buttons) or the form closes the moment it opens.
    const related = event.relatedTarget
    if (related instanceof Node && this.menu?.contains(related)) return
    this.hidePlusButton()
    this.close()
  }

  private handleSelectionChange = (): void => {
    if (this.anchor === 'block') return
    if (!this.editorFocused() || this.editor.readonly) {
      this.hidePlusButton()
      this.close()
      return
    }
    const state = this.editor.editorView.state

    // A block-node selection over an image opens the image tools bubble (edit
    // alt / remove). Other block nodes (horizontal rule, embed) are whole
    // elements with no inline text to format, so never open anything there.
    if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'image') {
      this.hidePlusButton()
      if (this.menu && this.anchor === 'selection') {
        // The alt form holds the previous image's value, and a menu from
        // another mode (format bubble) must switch to the image tools; rebuild
        // so the bubble matches the new selection. A plain image-tools bubble
        // just follows the selection.
        if (this.menu.querySelector('[data-wryte-image-action]') && !this.menu.querySelector('.wryte-context-link-input')) {
          this.repositionFromSelection()
        } else {
          this.openSelectionBubble('image')
        }
      } else {
        this.openSelectionBubble('image')
      }
      return
    }

    if (state.selection instanceof NodeSelection && state.selection.node.isBlock) {
      this.hidePlusButton()
      this.close()
      return
    }

    if (!state.selection.empty) {
      this.hidePlusButton()
      if (this.menu && this.anchor === 'selection') {
        this.repositionFromSelection()
        this.refreshActiveStates()
      } else {
        this.openSelectionBubble()
      }
      return
    }

    if (this.caretInEmptyBlock(state)) {
      this.close()
      this.showPlusButton()
    } else {
      this.hidePlusButton()
      this.close()
    }
  }

  private editorFocused(): boolean {
    const active = this.editor.element.ownerDocument?.activeElement
    return active != null && this.editor.element.contains(active)
  }

  // True when any of the block-insertion actions is enabled. The (+) button on
  // an empty line is pointless (and must not open an empty popup) when the
  // whitelist disabled every block ability.
  private hasAnyBlockAbility(): boolean {
    return (
      this.editor.abilityEnabled('attach') ||
      this.editor.abilityEnabled('codeBlock') ||
      this.editor.abilityEnabled('quote') ||
      this.editor.abilityEnabled('heading') ||
      this.editor.abilityEnabled('horizontalRule') ||
      this.editor.abilityEnabled('list')
    )
  }

  private caretInEmptyBlock(state: EditorState): boolean {
    if (!state.selection.empty) return false
    const block = state.selection.$from.parent
    return block.isTextblock && block.textContent.trim() === ''
  }

  // --- Inline (+) button for empty lines ---

  private showPlusButton(): void {
    if (!this.hasAnyBlockAbility()) return
    if (!this.plusButton) {
      this.plusButton = document.createElement('button')
      this.plusButton.type = 'button'
      this.plusButton.className = 'wryte-plus-button'
      this.plusButton.title = 'Add block'
      this.plusButton.setAttribute('aria-label', 'Add block')
      this.plusButton.innerHTML = iconMarkup('plus', 18)
      // Do not let the button steal focus from the editor on mousedown —
      // otherwise the editor blurs, the button is hidden, and the click that
      // opens the menu never fires.
      this.plusButton.addEventListener('mousedown', (event) => event.preventDefault())
      this.plusButton.addEventListener('click', this.handlePlusClick)
      this.editor.element.appendChild(this.plusButton)
      if (window.getComputedStyle(this.editor.element).position === 'static') {
        this.editor.element.style.position = 'relative'
      }
    }
    this.plusButton.style.display = 'inline-flex'
    this.positionPlusButton()
    // The position is computed from `coordsAtPos` right now, but at
    // initialization (autofocus) that can be before the browser has settled on
    // its final layout — fonts and images still loading, the page itself still
    // laying out — so the caret line can shift after this moment, leaving the
    // button floating above (or below) the empty line. Re-position on the next
    // frame and whenever the layout can change again so the button tracks the
    // line once it has settled.
    this.schedulePlusReposition()
    window.addEventListener('resize', this.handlePlusLayoutChange)
    window.addEventListener('scroll', this.handlePlusLayoutChange, true)
    window.addEventListener('load', this.handlePlusLayoutChange)
    if (document.fonts?.ready && !this.plusFontsListenerAttached) {
      this.plusFontsListenerAttached = true
      document.fonts.ready.then(() => {
        this.plusFontsListenerAttached = false
        this.handlePlusLayoutChange()
      })
    }
  }

  private hidePlusButton(): void {
    this.cancelPlusReposition()
    window.removeEventListener('resize', this.handlePlusLayoutChange)
    window.removeEventListener('scroll', this.handlePlusLayoutChange, true)
    window.removeEventListener('load', this.handlePlusLayoutChange)
    if (this.plusButton) this.plusButton.style.display = 'none'
  }

  // Re-position the button once the current layout has settled, without
  // stacking frames: `showPlusButton` (via `close`) can run several times in
  // a row, and each would otherwise queue its own re-position.
  private schedulePlusReposition(): void {
    if (this.plusPositionRaf != null) return
    this.plusPositionRaf = requestAnimationFrame(() => {
      this.plusPositionRaf = null
      this.handlePlusLayoutChange()
    })
  }

  private cancelPlusReposition(): void {
    if (this.plusPositionRaf == null) return
    cancelAnimationFrame(this.plusPositionRaf)
    this.plusPositionRaf = null
  }

  // Re-run after a layout change (frame, resize, scroll, load, font load).
  // The caret may have left the empty line meanwhile, in which case the
  // button must go away rather than be pinned to a stale position.
  private handlePlusLayoutChange = (): void => {
    if (!this.plusButton || this.plusButton.style.display === 'none') return
    if (!this.editorFocused() || this.editor.readonly) {
      this.hidePlusButton()
      return
    }
    const state = this.editor.editorView.state
    if (!this.caretInEmptyBlock(state)) {
      this.hidePlusButton()
      return
    }
    this.positionPlusButton()
  }

  private positionPlusButton(): void {
    if (!this.plusButton) return
    const view = this.editor.editorView
    let coords: Rect | null = null
    try {
      coords = view.coordsAtPos(view.state.selection.from)
    } catch {
      coords = null
    }
    const editorRect = this.editor.element.getBoundingClientRect()
    if (coords && editorRect.width > 0) {
      const style = window.getComputedStyle(this.editor.element)
      const borderTop = parseFloat(style.borderTopWidth) || 0
      // Place the button 1rem from the right edge, vertically centered on the
      // caret's line via translateY(-50%).
      const lineCenterY = coords.top + (coords.bottom - coords.top) / 2
      this.plusButton.style.left = 'auto'
      this.plusButton.style.right = '1rem'
      this.plusButton.style.top = `${Math.max(0, lineCenterY - editorRect.top - borderTop)}px`
      this.plusButton.style.transform = 'translateY(-50%)'
    } else {
      this.plusButton.style.left = 'auto'
      this.plusButton.style.right = '1rem'
      this.plusButton.style.top = '4px'
      this.plusButton.style.transform = 'translateY(-50%)'
    }
  }

  private handlePlusClick = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!this.plusButton) return
    const rect = this.plusButton.getBoundingClientRect()
    const x = rect.right
    const y = rect.top + rect.height / 2
    this.hidePlusButton()
    // The popup replaces the button on the same line, right-aligned to it.
    this.openMenu(x, y, 'block', 'block', 'right')
  }

  private handleFiles = (): void => {
    if (this.fileInput?.files?.length) this.editor.insertFiles(this.fileInput.files)
    if (this.fileInput) this.fileInput.value = ''
    this.close()
  }

  private openSelectionBubble(mode: MenuMode = 'format'): void {
    const rect = this.selectionRect()
    if (!rect) {
      this.openMenu(0, 0, 'selection', mode)
      return
    }
    const x = rect.left + (rect.right - rect.left) / 2
    this.openMenu(x, rect.top, 'selection', mode)
  }

  private selectionRect(): Rect | null {
    const view = this.editor.editorView
    try {
      const { from, to } = view.state.selection
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)
      return {
        left: Math.min(start.left, end.left),
        right: Math.max(start.right, end.right),
        top: Math.min(start.top, end.top),
        bottom: Math.max(start.bottom, end.bottom),
      }
    } catch {
      return null
    }
  }

  private repositionFromSelection(): void {
    if (!this.menu) return
    const rect = this.selectionRect()
    if (!rect) return
    const x = rect.left + (rect.right - rect.left) / 2
    this.placeMenu(x, rect.top)
  }

  // --- Menu lifecycle ---

  private openMenu(x: number, y: number, anchor: Anchor, mode: MenuMode, placement: 'above' | 'right' = 'above'): void {
    this.close()
    this.hidePlusButton()
    const menu = this.buildMenu(mode)
    if (!menu) {
      // No enabled ability maps to a button for this mode (e.g. an image was
      // right-clicked while the `image` ability is off), so there is nothing
      // to show. `buildMenu` returning null does not change the selection.
      return
    }
    this.anchor = anchor
    // Keep the editor focused while pressing menu buttons: a real browser moves
    // focus to the button on mousedown, the editor blur fires `handleFocusOut`,
    // the menu closes, and the click that would run the action never fires.
    menu.addEventListener('mousedown', (event) => {
      const target = event.target instanceof Node ? (event.target as Node) : null
      if (target instanceof Element && target.closest('button')) event.preventDefault()
    })
    document.body.appendChild(menu)
    this.menu = menu
    this.placeMenu(x, y, placement)

    window.addEventListener('pointerdown', this.handleOutsidePointerDown)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('scroll', this.handleScroll, true)
    window.addEventListener('resize', this.handleScroll)
    window.addEventListener('blur', this.handleWindowBlur)
  }

  private placeMenu(x: number, y: number, placement: 'above' | 'right' = 'above'): void {
    if (!this.menu) return
    const rect = this.menu.getBoundingClientRect()
    if (placement === 'right') {
      // The popup sits to the right of the (+) button, its right edge aligned
      // with the button's right edge, vertically centered on it.
      const right = Math.min(x, window.innerWidth - 4)
      const left = Math.max(4, right - rect.width)
      this.menu.style.left = `${left}px`
      this.menu.style.top = `${Math.max(4, Math.min(y - rect.height / 2, window.innerHeight - rect.height - 4))}px`
      return
    }
    const left = Math.max(4, Math.min(x - rect.width / 2, window.innerWidth - rect.width - 4))
    const above = y - rect.height - 10
    const top = above >= 4 ? above : y + 14
    this.menu.style.left = `${left}px`
    this.menu.style.top = `${top}px`
  }

  private handleOutsidePointerDown = (event: PointerEvent): void => {
    if (!this.menu) return
    if (event.target instanceof Node && this.menu.contains(event.target)) return
    if (this.anchor === 'selection' && event.target instanceof Node && this.editor.element.contains(event.target)) {
      return
    }
    this.close()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.close()
  }

  private handleScroll = (): void => {
    if (this.anchor === 'selection') this.repositionFromSelection()
    else this.close()
  }

  private handleWindowBlur = (): void => {
    this.close()
  }

  // Builds the popup for the given mode, showing only the buttons whose
  // ability is enabled (`editor.abilityEnabled`). Returns null when no enabled
  // ability maps to a button, in which case no menu opens.
  private buildMenu(mode: MenuMode): HTMLElement | null {
    const menu = document.createElement('div')
    menu.className = 'wryte-context-menu'
    menu.setAttribute('role', mode === 'format' ? 'toolbar' : 'menu')

    if (mode === 'image') {
      // The image tools bubble mirrors Trix's attachment toolbar: edit the alt
      // text (caption) or remove the image. Gated on the `image` ability.
      if (!this.editor.abilityEnabled('image')) return null
      menu.appendChild(this.imageItem('edit'))
      menu.appendChild(this.imageItem('trash'))
      return menu
    }

    if (mode === 'block') {
      // The block-insertion popup mirrors the bubble's block group: attachment
      // first, a divider, then the block-formatting actions.
      const attachAllowed = this.editor.abilityEnabled('attach')
      const actions: Array<[IconName, boolean]> = [
        ['code', this.editor.abilityEnabled('codeBlock')],
        ['quote', this.editor.abilityEnabled('quote')],
        ['heading2', this.editor.abilityEnabled('heading')],
        ['hr', this.editor.abilityEnabled('horizontalRule')],
        ['bullet', this.editor.abilityEnabled('list')],
      ]
      const enabled = actions.filter(([, allowed]) => allowed)
      if (!attachAllowed && enabled.length === 0) return null
      if (attachAllowed) menu.appendChild(this.blockItem('attach'))
      if (attachAllowed && enabled.length > 0) menu.appendChild(this.divider())
      for (const [name] of enabled) {
        // The list button cycles paragraph -> bullet -> number -> paragraph, so
        // it gets the special list action rather than a plain `bullet` toggle.
        if (name === 'bullet') menu.appendChild(this.blockListButton())
        else menu.appendChild(this.blockItem(name))
      }
      return menu
    }

    // Formatting bubble: the emphasis button (bold/italic/strike cycle) and the
    // code/spoiler button each appear when any of their marks is enabled; the
    // link button needs the `link` ability. The block-formatting group (heading,
    // quote, list) mirrors the block popup.
    const emphasis = (['bold', 'italic', 'strike'] as const).some((name) => this.editor.abilityEnabled(name))
    const codeSpoiler = (['spoiler', 'code'] as const).some((name) => this.editor.abilityEnabled(name))
    const link = this.editor.abilityEnabled('link')
    const blocks: Array<[IconName, boolean]> = [
      ['heading2', this.editor.abilityEnabled('heading')],
      ['quote', this.editor.abilityEnabled('quote')],
      ['bullet', this.editor.abilityEnabled('list')],
    ]
    const blockButtons = blocks.filter(([, allowed]) => allowed)
    const inlineCount = (emphasis ? 1 : 0) + (codeSpoiler ? 1 : 0) + (link ? 1 : 0)
    if (inlineCount === 0 && blockButtons.length === 0) return null
    if (emphasis) menu.appendChild(this.iconAttributeItem('bold'))
    if (codeSpoiler) menu.appendChild(this.iconAttributeItem('code'))
    if (link) menu.appendChild(this.iconLinkItem())
    if (inlineCount > 0 && blockButtons.length > 0) menu.appendChild(this.divider())
    for (const [name] of blockButtons) menu.appendChild(this.iconAttributeItem(name))

    return menu
  }

  // --- Format bubble items ---

  // Every formatting button keeps the bubble open over the selection so the
  // user can keep formatting; the selection is only reset by the user (clicking
  // away, Escape, blur). A block-code conversion collapses the selection to a
  // caret, so close then.
  private iconAttributeItem(name: IconName): HTMLElement {
    const button = this.iconItem(name)
    button.dataset.wryteAttribute = name
    if (name === 'heading2') this.updateHeadingButton(button)
    else if (name === 'bullet') this.updateListButton(button)
    else if (name === 'bold') this.updateEmphasisButton(button)
    else if (name === 'code') this.updateCodeSpoilerButton(button)
    else if (this.editor.attributeIsActive(name)) button.classList.add('is-active')
    button.addEventListener('click', () => {
      this.editor.toggleAttribute(name)
      if (this.editor.editorView.state.selection.empty) {
        this.close()
      } else {
        this.refreshActiveStates()
        if (this.anchor === 'selection') this.repositionFromSelection()
      }
    })
    return button
  }

  private iconLinkItem(): HTMLElement {
    const button = this.iconItem('link')
    button.dataset.wryteAction = 'link'
    if (this.editor.attributeIsActive('href')) button.classList.add('is-active')
    button.addEventListener('click', () => this.showLinkForm())
    return button
  }

  // --- Block-insertion popup items ---

  private blockItem(name: IconName): HTMLElement {
    const button = this.iconItem(name)
    button.dataset.wryteBlockAction = name
    button.addEventListener('click', () => this.applyBlockAction(name))
    return button
  }

  // The block popup list button cycles paragraph -> bullet -> number -> paragraph
  // like the toolbar and bubble list buttons, so its icon must reflect the
  // current list type and its active state.
  private blockListButton(): HTMLElement {
    const button = this.iconItem('bullet')
    button.dataset.wryteBlockAction = 'list'
    this.updateListButton(button)
    button.addEventListener('click', () => {
      this.editor.toggleAttribute('bullet')
      this.close()
    })
    return button
  }

  private applyBlockAction(name: string): void {
    switch (name) {
      case 'attach':
        this.fileInput?.click()
        return
      case 'code':
        this.editor.setBlockCode()
        break
      case 'quote':
        this.editor.activateAttribute('quote')
        break
      case 'heading2':
        this.editor.activateAttribute('heading2')
        break
      case 'hr':
        this.editor.insertHorizontalRule()
        break
    }
    this.close()
  }

  private iconItem(name: IconName, disabled = false): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'wryte-context-item wryte-context-item--icon'
    button.title = LABELS[name]
    button.setAttribute('aria-label', LABELS[name])
    button.disabled = disabled
    button.innerHTML = iconMarkup(name)
    return button
  }

  private divider(): HTMLElement {
    const element = document.createElement('span')
    element.className = 'wryte-context-divider'
    element.setAttribute('role', 'separator')
    return element
  }

  private refreshActiveStates(): void {
    if (!this.menu) return
    this.menu.querySelectorAll('[data-wryte-attribute]').forEach((element) => {
      const name = (element as HTMLElement).dataset.wryteAttribute
      if (!name) return
      if (name === 'heading2') {
        this.updateHeadingButton(element as HTMLButtonElement)
        return
      }
      if (name === 'bullet') {
        this.updateListButton(element as HTMLButtonElement)
        return
      }
      if (name === 'bold') {
        this.updateEmphasisButton(element as HTMLButtonElement)
        return
      }
      if (name === 'code') {
        this.updateCodeSpoilerButton(element as HTMLButtonElement)
        return
      }
      element.classList.toggle('is-active', this.editor.attributeIsActive(name))
    })
    this.menu.querySelectorAll('[data-wryte-action="link"]').forEach((element) => {
      element.classList.toggle('is-active', this.editor.attributeIsActive('href'))
    })
  }

  // The heading button cycles paragraph -> H2 -> H3 -> paragraph, so its icon
  // must reflect the current block: the H2 glyph by default, the H3 glyph
  // while in a heading 3.
  private updateHeadingButton(button: HTMLButtonElement): void {
    const isHeading = this.editor.attributeIsActive('heading2') || this.editor.attributeIsActive('heading3')
    const icon = this.editor.attributeIsActive('heading3') ? 'heading3' : 'heading2'
    button.innerHTML = iconMarkup(icon)
    button.classList.toggle('is-active', isHeading)
  }

  // The list button cycles paragraph -> bullet -> number -> paragraph, so its
  // icon must reflect the current list type: bullet by default, numeral while
  // a numbered list is active.
  private updateListButton(button: HTMLButtonElement): void {
    const isNumber = this.editor.attributeIsActive('number')
    const isList = isNumber || this.editor.attributeIsActive('bullet')
    button.innerHTML = iconMarkup(isNumber ? 'number' : 'bullet')
    button.title = LABELS[isNumber ? 'number' : 'bullet']
    button.setAttribute('aria-label', LABELS[isNumber ? 'number' : 'bullet'])
    button.classList.toggle('is-active', isList)
  }

  // The emphasis button cycles bold -> italic -> strike -> none, so its icon
  // must reflect the active inline style: bold by default (the first step of
  // the cycle), italic while italicized, strikethrough while struck through.
  private updateEmphasisButton(button: HTMLButtonElement): void {
    const isBold = this.editor.attributeIsActive('bold')
    const isItalic = this.editor.attributeIsActive('italic')
    const isStrike = this.editor.attributeIsActive('strike')
    const icon = isStrike ? 'strike' : isItalic ? 'italic' : 'bold'
    button.innerHTML = iconMarkup(icon)
    button.title = LABELS[isStrike ? 'strike' : isItalic ? 'italic' : 'bold']
    button.setAttribute('aria-label', LABELS[isStrike ? 'strike' : isItalic ? 'italic' : 'bold'])
    button.classList.toggle('is-active', isBold || isItalic || isStrike)
  }

  // The code/spoiler button cycles spoiler -> code -> none, so its icon must
  // reflect the active style: spoiler by default (the first step of the cycle),
  // code while inline code is applied.
  private updateCodeSpoilerButton(button: HTMLButtonElement): void {
    const isCode = this.editor.attributeIsActive('code')
    const isSpoiler = this.editor.attributeIsActive('spoiler')
    const icon = isCode ? 'code' : 'spoiler'
    button.innerHTML = iconMarkup(icon)
    button.title = LABELS[isCode ? 'code' : 'spoiler']
    button.setAttribute('aria-label', LABELS[isCode ? 'code' : 'spoiler'])
    button.classList.toggle('is-active', isCode || isSpoiler)
  }

  private showLinkForm(): void {
    if (!this.menu) return
    const menu = this.menu
    menu.innerHTML = ''
    menu.classList.add('wryte-context-menu--link')

    const input = document.createElement('input')
    input.type = 'url'
    input.className = 'wryte-context-link-input'
    input.placeholder = 'https://example.com'
    const current = this.editor.currentLinkHref()
    if (current) input.value = current

    const apply = document.createElement('button')
    apply.type = 'button'
    apply.className = 'wryte-context-item'
    apply.textContent = 'Link'

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'wryte-context-item'
    remove.textContent = 'Remove'

    const applyLink = (): void => {
      const value = input.value.trim()
      if (value) this.editor.setLink(value)
      else this.editor.unlink()
      this.close()
      this.editor.focus()
    }

    apply.addEventListener('click', applyLink)
    remove.addEventListener('click', () => {
      this.editor.unlink()
      this.close()
      this.editor.focus()
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyLink()
      if (event.key === 'Escape') {
        this.close()
        this.editor.focus()
      }
    })

    menu.append(input, apply, remove)
    input.focus()
  }

  // --- Image tools (selected block image) ---

  // Trix shows a toolbar with Remove next to an inline caption editor when an
  // image is selected. Here the caption editor is a small form that opens in
  // the bubble (like the link form); the toolbar Remove deletes the image.
  private imageItem(name: IconName): HTMLElement {
    const button = this.iconItem(name)
    button.dataset.wryteImageAction = name
    button.addEventListener('click', () => this.applyImageAction(name))
    return button
  }

  private applyImageAction(name: string): void {
    if (name === 'edit') {
      this.showAltForm()
      return
    }
    if (name === 'trash') {
      this.removeSelectedImage()
      this.close()
    }
  }

  private removeSelectedImage(): void {
    const view = this.editor.editorView
    const { selection } = view.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
    const pos = selection.from
    view.dispatch(view.state.tr.delete(pos, pos + selection.node.nodeSize))
  }

  // The alt-text form, mirroring `showLinkForm`: a text field plus Apply and
  // Remove buttons. Apply stores the value (empty clears the alt), Remove
  // clears it outright.
  private showAltForm(): void {
    if (!this.menu) return
    const menu = this.menu
    menu.innerHTML = ''
    menu.classList.add('wryte-context-menu--link')

    const selection = this.editor.editorView.state.selection
    const currentAlt =
      selection instanceof NodeSelection && selection.node.type.name === 'image'
        ? ((selection.node.attrs.alt as string | null) ?? '')
        : ''

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'wryte-context-link-input'
    input.placeholder = 'Add alt text…'
    input.value = currentAlt

    const apply = document.createElement('button')
    apply.type = 'button'
    apply.className = 'wryte-context-item'
    apply.textContent = 'Apply'

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'wryte-context-item'
    remove.textContent = 'Remove'

    const applyAlt = (): void => {
      this.editor.setImageAlt(input.value)
      this.close()
      this.editor.focus()
    }

    apply.addEventListener('click', applyAlt)
    remove.addEventListener('click', () => {
      this.editor.setImageAlt('')
      this.close()
      this.editor.focus()
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyAlt()
      if (event.key === 'Escape') {
        // Focus the editor back but don't let the still-selected image reopen
        // the bubble (see `handleFocus`).
        this.suppressNextFocusOpen = true
        this.close()
        this.editor.focus()
      }
    })

    menu.append(input, apply, remove)
    input.focus()
  }

  private close(): void {
    if (this.menu) {
      this.menu.remove()
      this.menu = null
    }
    this.anchor = null
    window.removeEventListener('pointerdown', this.handleOutsidePointerDown)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('scroll', this.handleScroll, true)
    window.removeEventListener('resize', this.handleScroll)
    window.removeEventListener('blur', this.handleWindowBlur)
    // Closing a menu does not change the selection, so `handleSelectionChange`
    // won't re-run on its own. Re-assert the empty-line affordance: when the
    // caret is still in an empty block (and the editor is focused and
    // editable), bring the (+) button back — e.g. after the block popup is
    // dismissed with Escape or an outside click.
    if (this.editorFocused() && !this.editor.readonly && this.hasAnyBlockAbility()) {
      const state = this.editor.editorView.state
      if (this.caretInEmptyBlock(state)) this.showPlusButton()
    }
  }
}
