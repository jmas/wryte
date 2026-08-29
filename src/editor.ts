import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { gapCursor } from 'prosemirror-gapcursor'
import { history, undoDepth, redoDepth, closeHistory, undo as undoCommand, redo as redoCommand } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import {
  baseKeymap,
  chainCommands,
  toggleMark,
  setBlockType,
  wrapIn,
  lift,
  splitBlock,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  deleteSelection,
} from 'prosemirror-commands'
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'
import { findWrapping, canJoin } from 'prosemirror-transform'
import { wrapInList, liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import { DOMParser, DOMSerializer, Mark, Slice, Fragment, type Node as PMNode, type NodeType } from 'prosemirror-model'
import { schema, type AttachmentAttrs } from './schema'
import { markdownParser, markdownSerializer } from './markdown'
import { Attachment } from './attachment'
import type { AttachmentDelegate } from './attachment'
import { EventName, dispatchWryteEvent } from './events'
import type { WryteEventName } from './events'
import { UploadManager, type UploadSuccessResult } from './upload'
import { EmbedManager, extractHost, URL_RE, type EmbedResult } from './embed'
import { textOffsetToPos, posToTextOffset, lastInlinePos } from './positions'
import { ToolbarController } from './toolbar'
import { ContextMenuController } from './contextmenu'
import { selectionHighlightPlugin } from './selection-highlight'
import { ImageNodeView } from './image-node-view'

const domParser = DOMParser.fromSchema(schema)
const domSerializer = DOMSerializer.fromSchema(schema)

// Hides inline spoiler text (rendered as `span.wryte-spoiler`) until hover.
// Injected once, from the Editor, so it covers both the custom element and
// programmatic mounts.
let editorStylesInjected = false
function injectEditorStyles(): void {
  if (editorStylesInjected || typeof document === 'undefined') return
  editorStylesInjected = true
  const style = document.createElement('style')
  style.textContent =
    '.wryte-spoiler{background:#3f3f46;color:transparent;border-radius:3px;padding:0 1px;transition:color .15s}.wryte-spoiler:hover{color:#fafafa}' +
    '.wryte-image{position:relative;display:block;max-width:20rem;width:100%;background:#e4e4e7;border-radius:6px;outline:1px solid rgba(0,0,0,.15);outline-offset:-1px;overflow:hidden}' +
    '.wryte-image img[data-wryte-attachment]{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;object-position:center;margin:0}' +
    '.wryte-image.wryte-selected{outline:3px solid #2563eb;outline-offset:2px}' +
    '.wryte-image .wryte-progress{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,.45)}' +
    '.wryte-image .wryte-progress[hidden]{display:none}' +
    '.wryte-image .wryte-progress svg{width:2.5rem;height:2.5rem;transform:rotate(-90deg)}' +
    '.wryte-progress-track{fill:none;stroke:#d4d4d8;stroke-width:3}' +
    '.wryte-progress-bar{fill:none;stroke:#2563eb;stroke-width:3;stroke-linecap:round}' +
    '.ProseMirror hr{margin:1.5rem 0;height:1px;border:none;background:#d4d4d8}' +
    '.ProseMirror hr.wryte-selected{background:#2563eb;outline:2px solid #2563eb;outline-offset:2px}' +
    '.ProseMirror div.wryte-embed{display:flex;align-items:center;gap:12px;box-sizing:border-box;max-width:20rem;width:100%;border:1px solid #e4e4e7;border-radius:8px;padding:10px;background:#ffffff;color:#18181b;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '.ProseMirror .wryte-embed-image{width:3rem;height:3rem;aspect-ratio:1/1;object-fit:cover;border-radius:6px;background:#f4f4f5;flex-shrink:0;margin:0}' +
    '.ProseMirror .wryte-embed-title{font-size:13px;font-weight:600;line-height:1.35;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.ProseMirror .wryte-embed-host{font-size:12px;color:#71717a;word-break:break-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ProseMirror .wryte-embed-body{display:flex;flex-direction:column;min-width:0;gap:2px}' +
    '.ProseMirror div.wryte-embed.wryte-selected{outline:3px solid #2563eb;outline-offset:2px}' +
    'div.wryte-embed.wryte-selected{outline:3px solid #2563eb;outline-offset:2px}' +
    '.ProseMirror .wryte-image + .wryte-image,.ProseMirror .wryte-image + .wryte-embed,.ProseMirror .wryte-embed + .wryte-image,.ProseMirror .wryte-embed + .wryte-embed{margin-top:1rem}' +
    'img.ProseMirror-separator{display:inline-block!important;width:0!important;height:0!important;opacity:0;border:0!important;margin:0!important;padding:0!important;overflow:hidden}' +
    '.ProseMirror p:has(br.ProseMirror-trailingBreak:last-child):has(> a:first-child > [data-wryte-attachment]:first-child, > [data-wryte-attachment]:first-child){line-height:0}'
  document.head.appendChild(style)
}

const nodes = schema.nodes
const marks = schema.marks
const paragraphType = nodes.paragraph
const headingType = nodes.heading
const blockquoteType = nodes.blockquote
const bulletListType = nodes.bullet_list
const orderedListType = nodes.ordered_list
const listItemType = nodes.list_item
const codeBlockType = nodes.code_block
const attachmentType = nodes.attachment
const imageType = nodes.image
const embedType = nodes.embed
const boldMark = marks.bold
const italicMark = marks.italic
const strikeMark = marks.strike
const spoilerMark = marks.spoiler
const codeMark = marks.code
const linkMark = marks.link

const BLOCK_ATTRIBUTE_NAMES = [
  'quote',
  'code',
  'bullet',
  'number',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
]

export interface EditorOptions {
  autofocus?: boolean
  disableSpellcheck?: boolean
  tabIndex?: number
  multiline?: boolean
  placeholder?: string
  toolbar?: boolean | HTMLElement | string
  contextMenu?: boolean
  uploadTimeout?: number | null
  value?: string
  html?: string
  editable?: boolean
}

export interface EditorConfig {
  autofocus: boolean
  disableSpellcheck: boolean
  multiline: boolean
  tabIndex: number
  placeholder: string
  toolbar: boolean
  contextMenu: boolean
  uploadTimeout: number | null
  editable: boolean
}

export const config: EditorConfig = {
  autofocus: false,
  disableSpellcheck: false,
  multiline: true,
  tabIndex: 0,
  placeholder: '',
  toolbar: false,
  contextMenu: true,
  uploadTimeout: null,
  editable: true,
}

export interface EditorSelection {
  start: number
  end: number
}

export interface EditorSnapshot {
  document: unknown
  selectedRange: [number, number]
}

export type ResolvedEditorOptions = Omit<EditorConfig, 'toolbar'> & {
  toolbar: boolean | HTMLElement | string
  value?: string
  html?: string
}

function defaultDocument(): PMNode {
  return schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] })
}

function marksAtSelection(state: EditorState): readonly Mark[] {
  if (state.storedMarks) return state.storedMarks
  const { from, to, $from, $to } = state.selection
  if (from === to) return $from.marks()
  return $from.marksAcross($to) ?? Mark.none
}

// Enter inside a code block: a plain Enter on a non-empty line adds a new line
// (normal editing). On an empty line it exits the code block into a paragraph,
// dropping the empty line. A completely empty code block collapses into a plain
// paragraph. An empty line in the middle splits the block into two code blocks
// around the new paragraph. `Mod-Enter` also adds a new line.
function enterInCodeBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { $head, $anchor } = state.selection
  if (!$head.parent.type.spec.code || !$head.sameParent($anchor)) return false
  const text = $head.parent.textContent
  const rel = $head.parentOffset
  const lineStart = text.lastIndexOf('\n', rel - 1) + 1
  const relEnd = text.indexOf('\n', rel)
  const lineEnd = relEnd < 0 ? text.length : relEnd
  if (text.slice(lineStart, lineEnd).trim() !== '') return newlineInCode(state, dispatch)
  if (text.length === 0) return setBlockType(paragraphType)(state, dispatch)
  if (!dispatch) return true
  const pos = $head.before()
  const nodeSize = $head.parent.nodeSize
  const before = text.slice(0, lineStart).replace(/\n+$/, '')
  const after = text.slice(lineEnd + 1)
  const language = $head.parent.attrs.language
  const content: PMNode[] = []
  if (before) content.push(codeBlockType.create({ language }, schema.text(before)))
  content.push(paragraphType.createAndFill() as PMNode)
  if (after) content.push(codeBlockType.create({ language }, schema.text(after)))
  const tr = state.tr.replaceWith(pos, pos + nodeSize, content)
  let paraPos = pos + 1
  if (before) paraPos += 2 + before.length
  tr.setSelection(TextSelection.near(tr.doc.resolve(paraPos), 1))
  dispatch(tr.scrollIntoView())
  return true
}

// Wraps a line in a blockquote when `> ` is typed at its start. Never fires
// inside an existing blockquote, so blockquotes can't be nested.
function blockquoteInputRule(): InputRule {
  return new InputRule(/^\s*>\s$/, (state, _match, start, end) => {
    const $before = state.doc.resolve(start)
    for (let depth = $before.depth; depth > 0; depth--) {
      if ($before.node(depth).type === blockquoteType) return null
    }
    const tr = state.tr.delete(start, end)
    const $start = tr.doc.resolve(start)
    const range = $start.blockRange()
    const wrapping = range && findWrapping(range, blockquoteType)
    if (!wrapping) return null
    tr.wrap(range, wrapping)
    const before = tr.doc.resolve(start - 1).nodeBefore
    if (before && before.type === blockquoteType && canJoin(tr.doc, start - 1)) tr.join(start - 1)
    return tr
  })
}

// A URL typed at the start of an empty line becomes an embed card (typing the
// URL then a space triggers it). The line is replaced by the card plus a fresh
// paragraph for the caret. Inside a blockquote or list the card would break the
// container, so there the URL degrades to a plain link mark.
function embedInputRule(): InputRule {
  // `URL_RE` carries `^...$` anchors; strip them so the trailing-space trigger
  // (`\s$`) can be appended to match a URL typed so far plus the space.
  const urlSource = URL_RE.source.replace(/^\^/, '').replace(/\$$/, '')
  return new InputRule(new RegExp('^' + urlSource + '\\s$'), (state, match, start, end) => {
    const { $from } = state.selection
    if ($from.parent.type !== paragraphType) return null
    const url = match[0].trim()
    // `end` is the cursor position before the trailing space (the pending
    // text), so the typed URL spans [start, end).
    const linkFallback = state.tr.addMark(start, end, linkMark.create({ href: url }))
    for (let depth = $from.depth; depth > 0; depth--) {
      const type = $from.node(depth).type
      if (type === blockquoteType || type === listItemType) return linkFallback
    }
    const host = extractHost(url)
    const embed = embedType.create({ url, host })
    const para = paragraphType.createAndFill() as PMNode
    const depth = $from.depth
    const content = Fragment.fromArray([embed, para])
    const parent = $from.node(depth - 1)
    if (!parent.canReplace($from.index(depth), $from.index(depth) + 1, content)) return linkFallback
    const blockStart = $from.before(depth)
    const blockEnd = $from.after(depth)
    const tr = state.tr.replaceWith(blockStart, blockEnd, content)
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockStart + embed.nodeSize + 1)))
    return tr.scrollIntoView()
  })
}

// A blockquote may only hold paragraphs, so flatten any other block content
// (headings, code, lists, nested quotes) into paragraphs. Applied on load so
// `> # heading` and similar input degrades gracefully instead of being dropped.
function blocksToParagraphs(node: PMNode): PMNode[] {
  if (node.type === paragraphType) return [node]
  if (node.type === headingType) return [paragraphType.create(null, node.content)]
  if (node.type === codeBlockType) {
    return node.textContent
      .split('\n')
      .map((line) => paragraphType.create(null, line ? schema.text(line) : undefined))
      .filter((n): n is PMNode => n != null)
  }
  const paragraphs: PMNode[] = []
  node.forEach((child) => paragraphs.push(...blocksToParagraphs(child)))
  return paragraphs
}

function normalizeBlockquoteContent(node: PMNode): PMNode {
  if (node.isLeaf) return node
  if (node.type === blockquoteType) {
    const paragraphs = blocksToParagraphs(node)
    const content = paragraphs.length ? paragraphs : [paragraphType.createAndFill() as PMNode]
    return blockquoteType.create(node.attrs, content)
  }
  const content: PMNode[] = []
  node.forEach((child) => content.push(normalizeBlockquoteContent(child)))
  return node.type.create(node.attrs, content)
}

// Lifting a block image out of a paragraph (`<p><a><img></a></p>`) leaves an
// empty paragraph directly before the image. Drop those so pasted images don't
// get a stray blank line. Applied to HTML parsing, which is where the
// paragraphs come from.
function dropEmptyParagraphsBeforeImages(node: PMNode): PMNode {
  if (node.isLeaf || node.isTextblock) return node
  const children: PMNode[] = []
  node.forEach((child) => children.push(child))
  const content: PMNode[] = []
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const next = children[i + 1]
    if (child.type === paragraphType && child.content.size === 0 && next && next.type === imageType) continue
    content.push(dropEmptyParagraphsBeforeImages(child))
  }
  return node.type.create(node.attrs, content)
}

function markIsActive(state: EditorState, markType: Mark['type']): boolean {
  const { from, to } = state.selection
  if (from !== to) return state.doc.rangeHasMark(from, to, markType)
  return marksAtSelection(state).some((mark) => mark.type === markType)
}

function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// True when the element is a custom element that already exposes a `value`
// accessor (e.g. <wryte-editor>). The Editor must not shadow it with an
// instance property in that case.
function elementHasValueAccessor(element: HTMLElement): boolean {
  let proto = Object.getPrototypeOf(element) as object | null
  while (proto && proto !== HTMLElement.prototype) {
    if (Object.prototype.hasOwnProperty.call(proto, 'value')) return true
    proto = Object.getPrototypeOf(proto)
  }
  return false
}

export class Editor implements AttachmentDelegate {
  readonly element: HTMLElement
  readonly options: ResolvedEditorOptions
  private view!: EditorView
  private uploadManager = new UploadManager(this)
  private embedManager = new EmbedManager(this)
  private embedScanPending = false
  private attachmentsById = new Map<string, Attachment>()
  private pendingFiles = new Map<string, File>()
  private lastAttributes: Record<string, unknown> = {}
  private lastActions: { undo: boolean; redo: boolean } = { undo: false, redo: false }
  private revision = 0
  private toolbarController: ToolbarController | null = null
  private imageNodeViews = new Map<string, ImageNodeView>()

  constructor(element: HTMLElement, options: EditorOptions = {}) {
    this.element = element
    this.options = { ...config, ...options }

    injectEditorStyles()
    dispatchWryteEvent(element, EventName.beforeInitialize, { editor: this })

    this.view = new EditorView(element, {
      state: this.createState(),
      dispatchTransaction: (tr) => this.handleTransaction(tr),
      editable: () => this.options.editable !== false,
      nodeViews: {
        image: (node) => {
          const id = node.attrs.id as string | null
          // The attachment is registered in `refreshAttachments` after this
          // factory runs (it runs during `view.updateState`), so the pending
          // flag also consults the transient `pendingFiles` map.
          const pending =
            id != null && (this.pendingFiles.has(id) || this.attachmentsById.get(id)?.isPending() === true)
          const attachment = id != null ? this.attachmentsById.get(id) : undefined
          const nodeView = new ImageNodeView(node, pending, attachment?.getUploadProgress() ?? 0, () => {
            if (id != null) this.imageNodeViews.delete(id)
          })
          if (id != null) this.imageNodeViews.set(id, nodeView)
          return nodeView
        },
      },
      clipboardTextParser: (text) => {
        const parsed = markdownParser.parse(text)
        if (!parsed) return new Slice(Fragment.empty, 0, 0)
        const content: PMNode[] = []
        parsed.content.forEach((child) => content.push(normalizeBlockquoteContent(child)))
        return new Slice(Fragment.from(content), 0, 0)
      },
      handlePaste: (_, event) => {
        dispatchWryteEvent(element, EventName.beforePaste, {
          editor: this,
          clipboardData: event.clipboardData,
        })
        const text = event.clipboardData?.getData('text/plain')?.trim() ?? ''
        if (text && URL_RE.test(text)) {
          if (this.insertEmbedUrl(text)) {
            event.preventDefault()
            return true
          }
          // A URL pasted over a selection or a non-empty line stays plain text:
          // never let the markdown clipboard parser turn it into an embed card
          // there (embeds are an empty-line-only feature).
          this.view.dispatch(this.view.state.tr.replaceSelectionWith(this.view.state.schema.text(text)))
          event.preventDefault()
          return true
        }
        dispatchWryteEvent(element, EventName.paste, { editor: this })
        return false
      },
      handleDOMEvents: {
        focus: () => {
          dispatchWryteEvent(element, EventName.focus, { editor: this })
          return false
        },
        blur: () => {
          dispatchWryteEvent(element, EventName.blur, { editor: this })
          return false
        },
      },
    })

    this.bindElementValue()
    this.setupToolbar()
    this.setupContextMenu()
    this.refreshAttachments()
    this.refreshSelectionState(this.view.state)
    // Kick off the embed scan for the initial document.
    this.scheduleEmbedScan()

    if (this.options.disableSpellcheck) element.setAttribute('spellcheck', 'false')
    if (this.options.tabIndex != null) element.tabIndex = this.options.tabIndex
    if (this.options.placeholder) element.setAttribute('data-wryte-placeholder', this.options.placeholder)
    this.updateEmptyState(this.view.state)
    if (this.options.autofocus) this.focus()

    dispatchWryteEvent(element, EventName.initialize, { editor: this })
  }

  // --- Lifecycle helpers ---

  private createState(): EditorState {
    return EditorState.create({ doc: this.initialDocument(), plugins: this.plugins() })
  }

  private initialDocument(): PMNode {
    if (this.options.value != null) {
      return normalizeBlockquoteContent(markdownParser.parse(this.options.value) ?? defaultDocument())
    }
    if (this.options.html != null) {
      return normalizeBlockquoteContent(this.parseHTMLDocument(this.options.html))
    }
    const text = this.element.textContent
    if (text != null && text.trim() !== '') {
      return normalizeBlockquoteContent(markdownParser.parse(text) ?? defaultDocument())
    }
    return defaultDocument()
  }

  private plugins() {
    return [
      history(),
      gapCursor(),
      selectionHighlightPlugin(),
      inputRules({
        rules: [
          textblockTypeInputRule(/^(#{1,6})\s$/, headingType, (match) => ({ level: match[1].length >= 3 ? 3 : 2 })),
          blockquoteInputRule(),
          embedInputRule(),
          wrappingInputRule(/^\s*([-+*])\s$/, bulletListType),
          wrappingInputRule(
            /^(\d+)\.\s$/,
            orderedListType,
            (match) => ({ order: Number(match[1]) }),
            (match, node) => node.childCount + Number(match[1]) === 1,
          ),
        ],
      }),
      keymap({
        'Mod-b': toggleMark(boldMark),
        'Mod-i': toggleMark(italicMark),
        'Mod-z': undoCommand,
        'Shift-Mod-z': redoCommand,
        'Mod-y': redoCommand,
        'Mod-k': () => {
          this.toolbarController?.toggleLinkDialog()
          return true
        },
        'Enter': chainCommands(
          enterInCodeBlock,
          splitListItem(listItemType),
          createParagraphNear,
          liftEmptyBlock,
          splitBlock,
        ),
        'Mod-Enter': newlineInCode,
      }),
      keymap(baseKeymap),
    ]
  }

  private parseHTMLDocument(html: string): PMNode {
    const template = document.createElement('template')
    template.innerHTML = html
    const content = domParser.parse(template.content).content
    return dropEmptyParagraphsBeforeImages(schema.topNodeType.createAndFill(undefined, content) ?? defaultDocument())
  }

  private parseHTMLFragment(html: string): Fragment {
    const template = document.createElement('template')
    template.innerHTML = html
    const content: PMNode[] = []
    domParser.parse(template.content).content.forEach((child) => content.push(dropEmptyParagraphsBeforeImages(normalizeBlockquoteContent(child))))
    return Fragment.from(content)
  }

  private handleTransaction(tr: Transaction): void {
    const prevState = this.view.state
    const newState = prevState.apply(tr)
    this.view.updateState(newState)
    this.afterStateChange(prevState, newState)
  }

  // Mirrors document emptiness onto the element as `data-wryte-empty` so CSS
  // can show a placeholder. `:empty` can't be used: ProseMirror keeps a
  // `<p><br></p>` in the DOM even for an empty document. An empty doc is a
  // single empty paragraph (PM always collapses deletions down to that).
  private updateEmptyState(state: EditorState): void {
    const doc = state.doc
    const empty =
      doc.childCount === 1 &&
      doc.child(0).type === paragraphType &&
      doc.child(0).childCount === 0
    if (empty) this.element.setAttribute('data-wryte-empty', '')
    else this.element.removeAttribute('data-wryte-empty')
  }

  private afterStateChange(prevState: EditorState, nextState: EditorState): void {
    const docChanged = !prevState.doc.eq(nextState.doc)
    const selectionChanged = !prevState.selection.eq(nextState.selection)

    if (docChanged) {
      this.revision++
      this.refreshAttachments()
      dispatchWryteEvent(this.element, EventName.sync, { editor: this })
      dispatchWryteEvent(this.element, EventName.render, { editor: this })
      dispatchWryteEvent(this.element, EventName.change, { editor: this })
    }

    if (selectionChanged) {
      dispatchWryteEvent(this.element, EventName.selectionChange, {
        editor: this,
        selection: this.getSelectedRange(),
      })
    }

    this.scheduleEmbedScan()
    this.refreshSelectionState(nextState)
    this.updateEmptyState(nextState)
  }

  // Scans for `embed` nodes and fires `wryte-embed-request` for any new URLs.
  // Coalesced onto the next tick so listeners attached synchronously after the
  // triggering transaction (e.g. right after a custom element upgrades, or the
  // initial selection operations in a host script) still catch the events, and
  // a burst of transactions only produces one scan.
  private scheduleEmbedScan(): void {
    if (this.embedScanPending) return
    this.embedScanPending = true
    setTimeout(() => {
      this.embedScanPending = false
      this.embedManager.refresh()
    }, 0)
  }

  private refreshSelectionState(state: EditorState): void {
    const attributes = this.computeCurrentAttributes(state)
    if (!objectsEqual(this.lastAttributes, attributes)) {
      this.lastAttributes = attributes
      dispatchWryteEvent(this.element, EventName.attributesChange, { editor: this, attributes })
    }
    const actions = { undo: this.canUndo(), redo: this.canRedo() }
    if (!objectsEqual(this.lastActions as unknown as Record<string, unknown>, actions)) {
      this.lastActions = actions
      dispatchWryteEvent(this.element, EventName.actionsChange, { editor: this, actions })
    }
    this.toolbarController?.update(attributes)
  }

  private computeCurrentAttributes(state: EditorState): Record<string, unknown> {
    const attributes: Record<string, unknown> = {}
    const markTypes: Record<string, Mark['type']> = {
      bold: boldMark,
      italic: italicMark,
      strike: strikeMark,
      spoiler: spoilerMark,
    }

    for (const name of ['bold', 'italic', 'strike', 'spoiler']) {
      attributes[name] = markIsActive(state, markTypes[name])
    }
    attributes.href = markIsActive(state, linkMark) ? (marksAtSelection(state).find((m) => m.type === linkMark)?.attrs.href ?? true) : false

    const blockAttribute = this.currentBlockAttribute(state)
    for (const name of BLOCK_ATTRIBUTE_NAMES) attributes[name] = false
    if (blockAttribute) attributes[blockAttribute] = true
    attributes.code = this.codeAttributeActive(state)

    return attributes
  }

  // True when the selection spans whole blocks (e.g. the user selected full
  // paragraphs). Text selections and carets are treated as inline.
  private selectionCoversWholeBlocks(state: EditorState): boolean {
    const { from, to, $from, $to } = state.selection
    if (from === to) return false
    return $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size
  }

  private codeAttributeActive(state: EditorState): boolean {
    if (this.currentBlockAttribute(state) === 'code') return true
    if (this.selectionCoversWholeBlocks(state)) return false
    return markIsActive(state, codeMark)
  }

  private currentBlockAttribute(state: EditorState): string | null {
    const cursor = state.selection.$from
    for (let depth = cursor.depth; depth >= 0; depth--) {
      const node = cursor.node(depth)
      const type = node.type
      if (type === headingType) return `heading${node.attrs.level}`
      if (type === codeBlockType) return 'code'
      if (type === blockquoteType) return 'quote'
      if (type === listItemType) {
        const parent = depth > 0 ? cursor.node(depth - 1) : null
        return parent && parent.type === orderedListType ? 'number' : 'bullet'
      }
    }
    return null
  }

  // True when the selection sits inside a list item. Headings must never be
  // nested in a list, so heading activation lifts the block out first.
  private selectionInList(state: EditorState): boolean {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === listItemType) return true
    }
    return false
  }

  // --- Attachments ---

  private refreshAttachments(): void {
    const doc = this.view.state.doc
    const found = new Map<string, PMNode>()

    doc.descendants((node) => {
      if ((node.type === attachmentType || node.type === imageType) && node.attrs.id) {
        found.set(node.attrs.id, node)
      }
    })

    for (const [id, attachment] of this.attachmentsById) {
      if (!found.has(id)) {
        this.attachmentsById.delete(id)
        this.uploadManager.clearTimer(attachment)
        dispatchWryteEvent(this.element, EventName.attachmentRemove, { editor: this, attachment })
      }
    }

    for (const [id, node] of found) {
      let attachment = this.attachmentsById.get(id)
      const pendingFile = this.pendingFiles.get(id)
      if (pendingFile) this.pendingFiles.delete(id)

      if (!attachment) {
        attachment = Attachment.fromNodeAttributes(node.attrs as AttachmentAttrs)
        attachment.setFile(pendingFile ?? null)
        attachment.setDelegate(this)
        this.attachmentsById.set(id, attachment)
        dispatchWryteEvent(this.element, EventName.attachmentAdd, { editor: this, attachment })
      } else {
        attachment.syncFromNode(node.attrs as AttachmentAttrs)
      }

      if (attachment.isPending()) this.uploadManager.requestUpload(attachment)
    }
  }

  private findAttachmentPos(id: string): number | null {
    let found: number | null = null
    this.view.state.doc.descendants((node, pos) => {
      if ((node.type === attachmentType || node.type === imageType) && node.attrs.id === id) {
        found = pos
        return false
      }
    })
    return found
  }

  attachmentDidChangeAttributes(attachment: Attachment): void {
    const pos = this.findAttachmentPos(attachment.id)
    if (pos == null) return
    const tr = this.view.state.tr.setNodeMarkup(pos, null, attachment.getAttributes() as unknown as Record<string, unknown>)
    this.view.dispatch(tr)
    dispatchWryteEvent(this.element, EventName.attachmentEdit, { editor: this, attachment })
  }

  attachmentDidRequestRemoval(attachment: Attachment): void {
    this.removeAttachment(attachment)
  }

  private removeAttachment(attachment: Attachment): void {
    const pos = this.findAttachmentPos(attachment.id)
    if (pos == null) return
    const node = this.view.state.doc.nodeAt(pos)
    if (!node) return
    this.view.dispatch(this.view.state.tr.delete(pos, pos + node.nodeSize))
  }

  succeedUpload(attachment: Attachment, attributes: UploadSuccessResult): void {
    attachment.setAttributes(attributes as Partial<AttachmentAttrs>)
    dispatchWryteEvent(this.element, EventName.uploadSuccess, {
      editor: this,
      attachment,
      attributes: attachment.getAttributes(),
    })
  }

  updateAttachmentProgress(attachment: Attachment, fraction: number): void {
    this.imageNodeViews.get(attachment.id)?.setProgress(fraction)
  }

  failUpload(attachment: Attachment, message: string): void {
    this.removeAttachment(attachment)
    dispatchWryteEvent(this.element, EventName.uploadError, {
      editor: this,
      attachment,
      error: { message },
    })
  }

  // --- Document IO ---

  loadMarkdown(markdown: string): void {
    const parsed = markdownParser.parse(markdown ?? '')
    this.loadDocument(parsed ?? defaultDocument())
  }

  toMarkdown(): string {
    return markdownSerializer.serialize(this.view.state.doc).replace(/\n$/, '')
  }

  loadHTML(html = ''): void {
    this.loadDocument(this.parseHTMLDocument(html))
  }

  toHTML(): string {
    const dom = domSerializer.serializeFragment(this.view.state.doc.content)
    const holder = document.createElement('div')
    holder.appendChild(dom)
    return holder.innerHTML
  }

  loadDocument(document: PMNode): void {
    const prevState = this.view.state
    // Recreate the state so the history stack starts fresh (mirrors Trix
    // creating a new UndoManager on load).
    const newState = EditorState.create({ doc: normalizeBlockquoteContent(document), plugins: prevState.plugins })
    this.view.updateState(newState)
    this.afterStateChange(prevState, newState)
  }

  getDocument(): PMNode {
    return this.view.state.doc
  }

  getSelectedDocument(): Slice | null {
    const { from, to } = this.view.state.selection
    if (from === to) return null
    return this.view.state.doc.slice(from, to)
  }

  getSnapshot(): EditorSnapshot {
    return { document: this.view.state.doc.toJSON(), selectedRange: this.getSelectedRange() }
  }

  loadSnapshot(snapshot: EditorSnapshot): void {
    const document = snapshot.document as Record<string, unknown> | null
    const node = document ? (schema.nodeFromJSON(document) as PMNode | null) : null
    this.loadDocument(node ?? defaultDocument())
    if (snapshot.selectedRange) this.setSelectedRange(snapshot.selectedRange)
  }

  toJSON(): EditorSnapshot {
    return this.getSnapshot()
  }

  loadJSON({ document, selectedRange }: EditorSnapshot): void {
    this.loadSnapshot({ document, selectedRange })
  }

  // --- Insertion ---

  insertString(text: string): void {
    if (!text) return
    const state = this.view.state
    const { from, to } = state.selection
    const marksAtSelection = state.storedMarks ?? state.selection.$from.marks()
    const node = schema.text(text, marksAtSelection)
    const tr = state.tr.replaceWith(from, to, node).scrollIntoView()
    tr.setSelection(TextSelection.near(tr.doc.resolve(from + node.nodeSize)))
    this.view.dispatch(tr)
  }

  insertText(text: string): void {
    this.insertString(text)
  }

  insertHTML(html: string): void {
    const fragment = this.parseHTMLFragment(html)
    const slice = new Slice(fragment, 0, 0)
    this.view.dispatch(this.view.state.tr.replaceSelection(slice))
  }

  insertLineBreak(): void {
    this.runCommand(splitBlock)
  }

  insertHorizontalRule(): void {
    const state = this.view.state
    const { $from } = state.selection
    // Replace the block containing the caret with the rule plus a fresh empty
    // paragraph, so the caret lands in editable text after the rule. A leaf
    // block can't hold a caret on its own.
    const depth = $from.depth
    const start = $from.before(depth)
    const end = $from.after(depth)
    const hr = nodes.horizontal_rule.create()
    const para = paragraphType.createAndFill() as PMNode
    const content = Fragment.fromArray([hr, para])
    // Skip containers that can't hold a rule (a blockquote only allows
    // paragraphs), matching the other block actions' behavior there.
    const parent = $from.node(depth - 1)
    if (!parent.canReplace($from.index(depth), $from.index(depth) + 1, content)) return
    const tr = state.tr.replaceWith(start, end, content)
    tr.setSelection(TextSelection.near(tr.doc.resolve(start + hr.nodeSize + 1)))
    this.view.dispatch(tr.scrollIntoView())
  }

  // Inserts an embed card for `url` when the caret sits in an empty paragraph,
  // replacing the line with the card plus a fresh paragraph. Returns false (and
  // leaves the document untouched) when the caret is not in an empty paragraph
  // or the block can't hold a card. The card is filled via `wryte-embed-request`.
  insertEmbed(url: string): boolean {
    return this.insertEmbedUrl(url)
  }

  private insertEmbedUrl(url: string): boolean {
    const trimmed = url.trim()
    if (!trimmed) return false
    const state = this.view.state
    const { selection } = state
    if (!selection.empty) return false
    const $from = selection.$from
    const block = $from.parent
    if (block.type !== paragraphType || block.textContent.trim() !== '') return false
    for (let depth = $from.depth; depth > 0; depth--) {
      const type = $from.node(depth).type
      if (type === blockquoteType || type === listItemType) return false
    }
    const host = extractHost(trimmed)
    const embed = embedType.create({ url: trimmed, host })
    const para = paragraphType.createAndFill() as PMNode
    const depth = $from.depth
    const content = Fragment.fromArray([embed, para])
    const parent = $from.node(depth - 1)
    if (!parent.canReplace($from.index(depth), $from.index(depth) + 1, content)) return false
    const blockStart = $from.before(depth)
    const blockEnd = $from.after(depth)
    const tr = state.tr.replaceWith(blockStart, blockEnd, content)
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockStart + embed.nodeSize + 1)))
    this.view.dispatch(tr.scrollIntoView())
    return true
  }

  // Applies a `wryte-embed-request` response to every embed card with `url`.
  // A no-op response (same attrs) doesn't touch the document, so refills never
  // loop. Missing fields keep the current card values (or fall back to the
  // URL's host for `host`).
  succeedEmbed(url: string, result: EmbedResult): void {
    const tr = this.view.state.tr
    let changed = false
    this.view.state.doc.descendants((node, pos) => {
      if (node.type !== embedType || node.attrs.url !== url) return
      const attrs = {
        url,
        host: result.host ?? node.attrs.host ?? extractHost(url),
        title: result.title ?? node.attrs.title ?? null,
        image: result.image ?? node.attrs.image ?? null,
      }
      const current = {
        url: node.attrs.url,
        host: node.attrs.host,
        title: node.attrs.title,
        image: node.attrs.image,
      }
      if (JSON.stringify(attrs) === JSON.stringify(current)) return
      tr.setNodeMarkup(pos, null, attrs)
      changed = true
    })
    if (changed) this.view.dispatch(tr)
    dispatchWryteEvent(this.element, EventName.embedSuccess, { editor: this, url, attributes: result })
  }


  insertAttachment(attachment: Attachment): void {
    this.insertAttachments([attachment])
  }

  insertAttachments(attachments: Attachment[]): void {
    if (!attachments.length) return
    const state = this.view.state
    let tr = state.tr
    for (const attachment of attachments) {
      const file = attachment.getFile()
      if (file) this.pendingFiles.set(attachment.id, file)
      const attrs = attachment.getAttributes() as unknown as Record<string, unknown>
      // Previewable (image) attachments are block nodes that stand on their own
      // line; everything else stays inline inside the paragraph.
      const type = attachment.isPreviewable() ? imageType : attachmentType
      tr = tr.replaceSelectionWith(type.create(attrs))
    }
    this.view.dispatch(tr)
  }

  insertFile(file: File): void {
    this.insertFiles([file])
  }

  insertFiles(files: FileList | File[]): void {
    const accepted: Attachment[] = []
    for (const file of Array.from(files)) {
      let reason: string | null = null
      const event = dispatchWryteEvent(this.element, EventName.fileAccept, {
        editor: this,
        file,
        reject: (message?: string) => {
          reason = message ?? 'File rejected'
        },
      })
      if (event.defaultPrevented || reason) {
        dispatchWryteEvent(this.element, EventName.fileReject, {
          editor: this,
          file,
          reason: reason ?? 'File rejected',
        })
        continue
      }
      accepted.push(Attachment.attachmentForFile(file))
    }
    this.insertAttachments(accepted)
  }

  insertDocument(document: PMNode): void {
    const state = this.view.state
    const slice = new Slice(normalizeBlockquoteContent(document).content, 0, 0)
    this.view.dispatch(state.tr.replaceSelection(slice))
  }

  // --- Attributes ---

  private blockAttributeNodeType(name: string): (typeof schema.nodes)['paragraph'] | null {
    switch (name) {
      case 'quote':
        return blockquoteType
      case 'code':
        return codeBlockType
      case 'bullet':
        return bulletListType
      case 'number':
        return orderedListType
      default: {
        if (/^heading[1-6]$/.test(name)) return headingType
        return null
      }
    }
  }

  private markTypeForAttribute(name: string): Mark['type'] | null {
    if (name === 'href') return linkMark
    return schema.marks[name] ?? null
  }

  canActivateAttribute(name: string): boolean {
    if (name === 'code') {
      const state = this.view.state
      if (!this.selectionCoversWholeBlocks(state)) return true
      const current = this.currentBlockAttribute(state)
      return current !== 'code' && current !== 'quote'
    }
    if (this.markTypeForAttribute(name)) return true
    if (!this.blockAttributeNodeType(name)) return false
    const current = this.currentBlockAttribute(this.view.state)
    if (name === 'quote') return current !== 'quote' && current !== 'bullet' && current !== 'number'
    if (/^heading[1-6]$/.test(name)) return current !== 'code' && current !== 'quote'
    return current !== 'code' && current !== 'quote'
  }

  attributeIsActive(name: string): boolean {
    if (name === 'code') return this.codeAttributeActive(this.view.state)
    const markType = this.markTypeForAttribute(name)
    if (markType) {
      return markIsActive(this.view.state, markType)
    }
    return this.currentBlockAttribute(this.view.state) === name
  }

  activateAttribute(name: string, value: boolean | string = true): void {
    if (name === 'code') {
      if (this.selectionCoversWholeBlocks(this.view.state)) {
        this.runCommand((state, dispatch) => this.codeBlockFromSelection(state, dispatch))
      } else if (!markIsActive(this.view.state, codeMark)) {
        this.runCommand(toggleMark(codeMark))
      }
      return
    }

    const markType = this.markTypeForAttribute(name)
    if (markType) {
      if (name === 'href' && typeof value === 'string' && value) {
        this.setLink(value)
      } else {
        if (!this.attributeIsActive(name)) this.runCommand(toggleMark(markType))
      }
      return
    }

    const current = this.currentBlockAttribute(this.view.state)
    if (name === 'quote') {
      if (current !== 'quote') this.runCommand((state, dispatch) => this.quoteBlock(state, dispatch))
    } else if (name === 'bullet') this.runCommand(wrapInList(bulletListType))
    else if (name === 'number') this.runCommand(wrapInList(orderedListType))
    else {
      const match = name.match(/^heading([1-6])$/)
      if (match) {
        // A heading must never live inside a list, so lift the block out of
        // any list before cycling: paragraph -> H2 -> H3 -> paragraph.
        const before = this.currentBlockAttribute(this.view.state)
        let lifted = false
        while (this.selectionInList(this.view.state)) {
          this.decreaseNestingLevel()
          lifted = true
        }
        // A heading already nested in a list keeps its level when lifted out.
        if (lifted && /^heading[1-6]$/.test(before ?? '')) return
        const block = this.currentBlockAttribute(this.view.state)
        if (block === 'heading3') this.runCommand(setBlockType(paragraphType))
        else if (block === 'heading2') this.runCommand(setBlockType(headingType, { level: 3 }))
        else this.runCommand(setBlockType(headingType, { level: 2 }))
      }
    }
  }

  deactivateAttribute(name: string): void {
    if (name === 'code') {
      const state = this.view.state
      if (this.currentBlockAttribute(state) === 'code') {
        this.runCommand((s, dispatch) => this.codeBlockToParagraphs(s, dispatch))
      } else if (markIsActive(state, codeMark)) {
        this.runCommand(toggleMark(codeMark))
      }
      return
    }

    const markType = this.markTypeForAttribute(name)
    if (markType) {
      if (name === 'href') this.unlink()
      else if (this.attributeIsActive(name)) this.runCommand(toggleMark(markType))
      return
    }
    if (name === 'quote') this.runCommand(lift)
    else if (name === 'code') this.runCommand(setBlockType(paragraphType))
    else if (name === 'bullet' || name === 'number') this.runCommand(liftListItem(listItemType))
    else {
      const match = name.match(/^heading[1-6]$/)
      if (match) this.runCommand(setBlockType(paragraphType))
    }
  }

  toggleAttribute(name: string): void {
    // The heading button cycles instead of toggling: paragraph -> H2 -> H3 ->
    // paragraph. The list button cycles the same way: paragraph -> bullet ->
    // number -> paragraph. The emphasis button (bold -> italic -> strike) and
    // the code/spoiler button cycle the same way.
    // `deactivateAttribute` remains for an explicit un-heading / un-list.
    if (/^heading[1-6]$/.test(name)) this.activateAttribute(name)
    else if (name === 'bullet') this.cycleListAttribute()
    else if (name === 'bold') this.cycleBoldItalicStrike()
    else if (name === 'code') this.cycleCodeSpoiler()
    else if (this.attributeIsActive(name)) this.deactivateAttribute(name)
    else this.activateAttribute(name)
  }

  // Cycles the emphasis button through bold -> italic -> strike -> none,
  // mirroring the heading cycle. The mark is force-set (not toggled) so
  // switching from bold to italic never leaves text bolded.
  private cycleBoldItalicStrike(): void {
    const group = [boldMark, italicMark, strikeMark]
    if (this.attributeIsActive('strike')) this.setOneOfMarks(group, null)
    else if (this.attributeIsActive('italic')) this.setOneOfMarks(group, strikeMark)
    else if (this.attributeIsActive('bold')) this.setOneOfMarks(group, italicMark)
    else this.setOneOfMarks(group, boldMark)
  }

  // Cycles the code/spoiler button through spoiler -> code -> none.
  private cycleCodeSpoiler(): void {
    if (this.attributeIsActive('code')) {
      this.deactivateAttribute('code')
    } else if (this.attributeIsActive('spoiler')) {
      this.deactivateAttribute('spoiler')
      this.activateAttribute('code')
    } else {
      this.activateAttribute('spoiler')
    }
  }

  // Replaces any mark from `group` over the selection with exactly the given
  // mark (or none of them), in a single transaction.
  private setOneOfMarks(group: Mark['type'][], target: Mark['type'] | null): void {
    const state = this.view.state
    const selection = state.selection
    const $cursor = selection.empty ? (selection as TextSelection).$cursor : null
    if (selection.empty && !$cursor) return
    const tr = state.tr

    if ($cursor) {
      for (const mark of group) tr.removeStoredMark(mark)
      if (target) tr.addStoredMark(target.create())
    } else {
      for (const { $from, $to } of selection.ranges) {
        for (const mark of group) tr.removeMark($from.pos, $to.pos, mark)
        if (!target) continue
        // Skip whitespace at the selection edges, like toggleMark does.
        let from = $from.pos
        let to = $to.pos
        const start = $from.nodeAfter
        const end = $to.nodeBefore
        const spaceStart = start && start.isText ? /^\s*/.exec(start.text ?? '')?.[0].length ?? 0 : 0
        const spaceEnd = end && end.isText ? /\s*$/.exec(end.text ?? '')?.[0].length ?? 0 : 0
        if (from + spaceStart < to) {
          from += spaceStart
          to -= spaceEnd
        }
        tr.addMark(from, to, target.create())
      }
    }
    this.view.dispatch(tr.scrollIntoView())
  }

  // Cycles the current block through paragraph -> bullet -> number -> paragraph.
  private cycleListAttribute(): void {
    const { $from } = this.view.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      if (node.type === bulletListType) {
        this.convertListTo(orderedListType)
        return
      }
      if (node.type === orderedListType) {
        this.runCommand(liftListItem(listItemType))
        return
      }
    }
    this.runCommand(wrapInList(bulletListType))
  }

  // Changes the innermost list containing the selection to the given list type.
  private convertListTo(listType: NodeType): void {
    const state = this.view.state
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      if (node.type !== bulletListType && node.type !== orderedListType) continue
      if (node.type === listType) return
      const pos = $from.before(depth)
      const attrs =
        listType === orderedListType
          ? { order: 1, tight: node.attrs.tight }
          : { tight: node.attrs.tight }
      this.view.dispatch(state.tr.setNodeMarkup(pos, listType, attrs))
      return
    }
  }

  setLink(href: string): void {
    const state = this.view.state
    const { from, to } = state.selection
    if (from === to) {
      const text = schema.text(href, [linkMark.create({ href })])
      const tr = state.tr.insert(from, text)
      tr.setSelection(TextSelection.near(tr.doc.resolve(from + text.nodeSize)))
      this.view.dispatch(tr)
    } else {
      this.runCommand(toggleMark(linkMark, { href }))
    }
  }

  // Force block-level code on the current block (used by the block-insertion
  // popup). Unlike `activateAttribute('code')` this always converts the block
  // to a code_block, even with a collapsed caret.
  setBlockCode(): void {
    const state = this.view.state
    if (this.selectionCoversWholeBlocks(state)) {
      this.runCommand((s, dispatch) => this.codeBlockFromSelection(s, dispatch))
    } else {
      this.runCommand(setBlockType(codeBlockType))
    }
  }

  unlink(): void {
    if (this.attributeIsActive('href')) this.runCommand(toggleMark(linkMark))
  }

  // --- Nesting ---

  canIncreaseNestingLevel(): boolean {
    return sinkListItem(listItemType)(this.view.state)
  }

  canDecreaseNestingLevel(): boolean {
    return liftListItem(listItemType)(this.view.state)
  }

  increaseNestingLevel(): void {
    this.runCommand(sinkListItem(listItemType))
  }

  decreaseNestingLevel(): void {
    this.runCommand(liftListItem(listItemType))
  }

  // --- Undo / redo ---

  // Wraps the current block in a blockquote. A blockquote may only hold
  // paragraphs, so headings and code blocks are converted to paragraphs first;
  // blocks inside a list or another quote are left untouched.
  private quoteBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === blockquoteType || $from.node(depth).type === listItemType) return false
    }
    const block = $from.parent
    if (block.type === paragraphType) return wrapIn(blockquoteType)(state, dispatch)

    if (!block.isTextblock) return false
    const depth = $from.depth
    let tr = state.tr
    let start: number
    let end: number
    if (block.type === codeBlockType) {
      const paragraphs = block.textContent
        .split('\n')
        .map((line) => paragraphType.create(null, line ? schema.text(line) : undefined))
        .filter((n): n is PMNode => n != null)
      start = $from.before(depth)
      end = $from.after(depth)
      tr = tr.replaceWith(start, end, paragraphs.length ? paragraphs : [paragraphType.createAndFill() as PMNode])
    } else {
      start = $from.start(depth)
      end = $from.end(depth)
      tr = tr.setBlockType(start, end, paragraphType)
    }
    const $start = tr.doc.resolve(tr.mapping.map(start))
    const $end = tr.doc.resolve(tr.mapping.map(end))
    const range = $start.blockRange($end)
    const wrapping = range && findWrapping(range, blockquoteType)
    if (!wrapping) return false
    tr.wrap(range, wrapping)
    if (dispatch) dispatch(tr.scrollIntoView())
    return tr.docChanged
  }

  private codeBlockFromSelection(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
    const { from, $from } = state.selection
    // A blockquote may only hold paragraphs, so never create a code block in one.
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === blockquoteType) return false
    }
    const text = state.doc.textBetween(state.selection.from, state.selection.to, '\n')
    const content = text ? schema.text(text) : undefined
    const node = codeBlockType.create({ language: null }, content)
    const tr = state.tr.replaceSelectionWith(node)
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(from))))
    if (dispatch) dispatch(tr.scrollIntoView())
    return tr.docChanged
  }

  private codeBlockToParagraphs(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
    let changed = false
    state.doc.descendants((node, pos) => {
      if (node.type !== codeBlockType) return
      const paragraphs = node.textContent
        .split('\n')
        .map((line) => paragraphType.createAndFill(null, line ? schema.text(line) : undefined))
        .filter((n): n is NonNullable<typeof n> => n != null)
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, paragraphs)
      if (dispatch) dispatch(tr)
      changed = true
      return false
    })
    return changed
  }

  canUndo(): boolean {
    return undoDepth(this.view.state) > 0
  }

  canRedo(): boolean {
    return redoDepth(this.view.state) > 0
  }

  undo(): void {
    if (this.canUndo()) this.runCommand(undoCommand)
  }

  redo(): void {
    if (this.canRedo()) this.runCommand(redoCommand)
  }

  recordUndoEntry(_description?: string, _options: { consolidatable?: boolean } = {}): void {
    const tr = closeHistory(this.view.state.tr)
    this.view.dispatch(tr)
  }

  // --- Selection ---

  getSelectedRange(): [number, number] {
    const state = this.view.state
    const doc = state.doc
    const start = posToTextOffset(doc, state.selection.from)
    const end = posToTextOffset(doc, state.selection.to)
    return [Math.min(start, end), Math.max(start, end)]
  }

  setSelectedRange(range: [number, number]): void {
    const state = this.view.state
    const from = textOffsetToPos(state.doc, range[0])
    const to = textOffsetToPos(state.doc, range[1])
    const tr = state.tr.setSelection(TextSelection.create(state.doc, Math.min(from, to), Math.max(from, to)))
    this.view.dispatch(tr)
  }

  getPosition(): number {
    return posToTextOffset(this.view.state.doc, this.view.state.selection.from)
  }

  getClientRectAtPosition(position: number): { left: number; right: number; top: number; bottom: number } | null {
    const pos = textOffsetToPos(this.view.state.doc, position)
    if (pos < 0 || pos > this.view.state.doc.content.size) return null
    return this.view.coordsAtPos(pos)
  }

  private setCursorAtPos(pos: number): void {
    const doc = this.view.state.doc
    const safe = Math.max(1, Math.min(pos, lastInlinePos(doc)))
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(doc, safe)))
  }

  moveCursorInDirection(direction: 'forward' | 'backward'): void {
    const { from, to } = this.view.state.selection
    if (direction === 'backward') {
      this.setCursorAtPos(from > 1 ? from - 1 : from)
    } else {
      this.setCursorAtPos(to + 1)
    }
  }

  expandSelectionInDirection(direction: 'forward' | 'backward'): void {
    const { from, to } = this.view.state.selection
    const doc = this.view.state.doc
    if (direction === 'backward') {
      const next = Math.max(1, from - 1)
      this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(doc, next, to)))
    } else {
      const next = Math.min(lastInlinePos(doc), to + 1)
      this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(doc, from, next)))
    }
  }

  deleteInDirection(direction: 'forward' | 'backward'): void {
    const state = this.view.state
    const { from, to } = state.selection
    if (from !== to) {
      this.runCommand(deleteSelection)
      return
    }
    if (direction === 'backward' && from > 1) {
      this.view.dispatch(state.tr.delete(from - 1, from))
    } else if (direction === 'forward' && to < state.doc.content.size) {
      this.view.dispatch(state.tr.delete(to, to + 1))
    }
  }

  // --- Convenience ---

  get editorView(): EditorView {
    return this.view
  }

  get attachments(): Attachment[] {
    return [...this.attachmentsById.values()]
  }

  getAttachments(): Attachment[] {
    return this.attachments
  }

  get selection(): EditorSelection | null {
    const [start, end] = this.getSelectedRange()
    return { start, end }
  }

  get selectedRange(): [number, number] {
    return this.getSelectedRange()
  }

  get isEmpty(): boolean {
    return this.view.state.doc.textContent.trim() === '' && this.attachments.length === 0
  }

  get edited(): boolean {
    return this.revision > 0
  }

  focus(): void {
    this.view.focus()
  }

  blur(): void {
    if (this.element === document.activeElement) this.element.blur()
  }

  disable(): void {
    this.options.editable = false
    this.view.updateState(this.view.state)
  }

  enable(): void {
    this.options.editable = true
    this.view.updateState(this.view.state)
  }

  clear(): void {
    this.loadDocument(defaultDocument())
  }

  dispatch<T extends Record<string, unknown>>(name: WryteEventName, detail: T): CustomEvent<T> {
    return dispatchWryteEvent(this.element, name, detail)
  }

  // --- Toolbar ---

  // The toolbar is purely optional and detached: the editor never creates or
  // inserts one into the DOM. When an element is supplied it is wired up as-is
  // (the consumer is responsible for placing and styling it).
  private setupToolbar(): void {
    const { toolbar } = this.options
    if (toolbar === false || toolbar == null || typeof toolbar === 'boolean') return
    const element = typeof toolbar === 'string' ? document.getElementById(toolbar) : toolbar
    if (!element) return
    this.toolbarController = new ToolbarController(element, this)
  }

  private setupContextMenu(): void {
    if (this.options.contextMenu === false) return
    new ContextMenuController(this)
  }
  private bindElementValue(): void {
    if (elementHasValueAccessor(this.element)) return
    Object.defineProperty(this.element, 'value', {
      configurable: true,
      enumerable: true,
      get: () => this.toMarkdown(),
      set: (value: string) => {
        this.loadMarkdown(value ?? '')
      },
    })
  }

  private runCommand(command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean): void {
    command(this.view.state, (tr) => this.view.dispatch(tr))
  }
}
