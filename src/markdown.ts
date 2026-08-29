import { MarkdownParser, MarkdownSerializer, type MarkdownSerializerState, type ParseSpec } from 'prosemirror-markdown'
import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
import type { Mark, Node as PMNode } from 'prosemirror-model'
import { schema, isVideoSrc } from './schema'
import { URL_RE, extractHost } from './embed'

interface MDToken {
  type: string
  content: string
  info?: string
  hidden?: boolean
  tag: string
  children?: MDToken[] | null
  attrGet(name: string): string | null
}

// CommonMark + strikethrough, no inline HTML. Striking text (`~~`) is the only
// non-CommonMark extension: it mirrors the markdown Trix understood.
const tokenizer = new MarkdownIt('commonmark', { html: false }).enable('strikethrough')

// `|` is not a markdown-it text terminator by default, so a `||spoiler||` marker
// would be swallowed whole by the text rule. Extend the terminators with `|`
// and register the spoiler rule ahead of `text` so the marker is ever parsed.
function isTextTerminator(ch: number): boolean {
  switch (ch) {
    case 0x0a: // \n
    case 0x21: // !
    case 0x23: // #
    case 0x24: // $
    case 0x25: // %
    case 0x26: // &
    case 0x2a: // *
    case 0x2b: // +
    case 0x2d: // -
    case 0x3a: // :
    case 0x3c: // <
    case 0x3d: // =
    case 0x3e: // >
    case 0x40: // @
    case 0x5b: // [
    case 0x5c: // \
    case 0x5d: // ]
    case 0x5e: // ^
    case 0x5f: // _
    case 0x60: // `
    case 0x7b: // {
    case 0x7c: // |
    case 0x7d: // }
    case 0x7e: // ~
      return true
    default:
      return false
  }
}

tokenizer.inline.ruler.at('text', (state, silent) => {
  let pos = state.pos
  while (pos < state.posMax && !isTextTerminator(state.src.charCodeAt(pos))) pos++
  if (pos === state.pos) return false
  if (!silent) state.pending += state.src.slice(state.pos, pos)
  state.pos = pos
  return true
})

tokenizer.inline.ruler.before('text', 'spoiler', (state, silent) => {
  const src = state.src
  if (src.charCodeAt(state.pos) !== 0x7c || src.charCodeAt(state.pos + 1) !== 0x7c) return false
  let pos = state.pos + 2
  while (pos < state.posMax - 1 && !(src.charCodeAt(pos) === 0x7c && src.charCodeAt(pos + 1) === 0x7c)) {
    pos++
  }
  if (pos >= state.posMax - 1) return false
  if (!src.slice(state.pos + 2, pos).trim()) return false
  if (!silent) {
    const start = state.pos
    const oldMax = state.posMax
    const open = state.push('spoiler_open', 'span', 1)
    open.markup = '||'
    open.map = [start, pos + 2]
    state.pos = start + 2
    state.posMax = pos
    state.md.inline.tokenize(state)
    state.posMax = oldMax
    const close = state.push('spoiler_close', 'span', -1)
    close.markup = '||'
  }
  state.pos = pos + 2
  return true
})

function listIsTight(tokens: MDToken[], i: number): boolean {
  while (++i < tokens.length) {
    if (tokens[i].type !== 'list_item_open') return tokens[i].hidden === true
  }
  return false
}

// Blockquotes may only hold paragraphs, so rewrite the token stream so any
// non-paragraph block inside a blockquote becomes paragraphs: headings become
// paragraphs, lists are flattened to their paragraph content, nested quotes are
// merged into the outer quote, and code blocks become one paragraph per line.
// Otherwise `MarkdownParser` would silently drop the whole blockquote when the
// content fails to fit the `paragraph+` schema.
function normalizeBlockquoteTokens(tokens: Token[]): Token[] {
  const out: Token[] = []
  let quoteDepth = 0
  let skipNested = 0
  for (const tok of tokens) {
    if (tok.type === 'blockquote_open') {
      if (quoteDepth > 0) {
        skipNested++
        continue
      }
      quoteDepth++
      out.push(tok)
      continue
    }
    if (tok.type === 'blockquote_close') {
      if (skipNested > 0) {
        skipNested--
        continue
      }
      if (quoteDepth > 0) quoteDepth--
      out.push(tok)
      continue
    }
    if (quoteDepth === 0) {
      out.push(tok)
      continue
    }
    switch (tok.type) {
      case 'heading_open':
        out.push(new Token('paragraph_open', 'p', 1))
        break
      case 'heading_close':
        out.push(new Token('paragraph_close', 'p', -1))
        break
      case 'bullet_list_open':
      case 'bullet_list_close':
      case 'ordered_list_open':
      case 'ordered_list_close':
      case 'list_item_open':
      case 'list_item_close':
      case 'hr':
        break
      case 'code_block':
      case 'fence': {
        const lines = tok.content.split('\n')
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
        if (!lines.length) lines.push('')
        for (const line of lines) {
          out.push(new Token('paragraph_open', 'p', 1))
          const text = new Token('text', '', 0)
          text.content = line
          out.push(text)
          out.push(new Token('paragraph_close', 'p', -1))
        }
        break
      }
      default:
        out.push(tok)
    }
  }
  return out
}

const parseTokens: { [name: string]: ParseSpec } = {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: {
    block: 'bullet_list',
    getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }),
  },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok, tokens, i) => ({
      order: Number(tok.attrGet('start')) || 1,
      tight: listIsTight(tokens, i),
    }),
  },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: Math.min(3, Math.max(2, +tok.tag.slice(1))) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: {
    block: 'code_block',
    getAttrs: (tok) => ({ language: (tok.info || '').trim().split(/\s+/)[0] || null }),
    noCloseToken: true,
  },
  hr: { node: 'horizontal_rule' },
  embed: {
    node: 'embed',
    getAttrs: (tok) => ({ url: tok.attrGet('href'), host: extractHost(tok.attrGet('href')) }),
  },
  image: {
    node: 'image',
    getAttrs: (tok) => {
      const src = tok.attrGet('src')
      return {
        url: src,
        alt: (tok.children && tok.children[0] && tok.children[0].content) || null,
        // A video-extension src makes the block image a video card (poster
        // preview + play button) instead of a broken `<img>`.
        contentType: isVideoSrc(src) ? 'video/*' : 'image/*',
      }
    },
  },
  hardbreak: { node: 'hard_break' },
  em: { mark: 'italic' },
  strong: { mark: 'bold' },
  s: { mark: 'strike' },
  spoiler: { mark: 'spoiler' },
  link: {
    mark: 'link',
    getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
}

// Images are block nodes in our schema, but markdown-it always emits the
// `image` token inline inside a paragraph. Rewrite the token stream so every
// image becomes its own block: paragraphs are split around image tokens (empty
// segments are dropped), and an image inside a blockquote — which may only hold
// paragraphs — degrades to a paragraph holding its alt text. Paragraphs without
// images pass through untouched, so markdown-it metadata (like the `hidden`
// flag that marks tight lists) is preserved.
function liftImagesFromParagraphs(tokens: Token[]): Token[] {
  const out: Token[] = []
  let quoteDepth = 0
  let paraOpen: Token | null = null
  let paraTokens: Token[] | null = null
  let paraClose: Token | null = null

  const segmentIsEmpty = (segment: Token[]): boolean =>
    segment.every((tok) => tok.type === 'text' && tok.content.trim() === '')

  // Markdown collapses whitespace at paragraph edges, so trim the first/last
  // text tokens of a segment. Without this, splitting around an image leaves a
  // stray space ("before " / " after").
  const trimSegment = (segment: Token[]): void => {
    if (!segment.length) return
    const first = segment[0]
    if (first.type === 'text') first.content = first.content.replace(/^\s+/, '')
    const last = segment[segment.length - 1]
    if (last.type === 'text') last.content = last.content.replace(/\s+$/, '')
  }

  const emitParagraph = (): void => {
    if (!paraOpen || !paraTokens || !paraClose) return
    const open = paraOpen
    const content = paraTokens
    const close = paraClose
    paraOpen = null
    paraTokens = null
    paraClose = null

    let hadImage = false
    for (const tok of content) {
      if (tok.type === 'inline' && tok.children?.some((child) => child.type === 'image')) {
        hadImage = true
        break
      }
    }
    if (!hadImage) {
      out.push(open, ...content, close)
      return
    }

    const segments: Token[][] = []
    let current: Token[] = []
    const pushCurrent = (): void => {
      trimSegment(current)
      if (current.length && !segmentIsEmpty(current)) segments.push(current)
      current = []
    }
    for (const tok of content) {
      if (tok.type === 'inline') {
        for (const child of tok.children ?? []) {
          if (child.type === 'image') {
            pushCurrent()
            if (quoteDepth > 0) {
              const text = new Token('text', '', 0)
              text.content = (child.children && child.children[0] && child.children[0].content) || ''
              current.push(text)
            } else {
              segments.push([child])
            }
          } else {
            current.push(child)
          }
        }
        pushCurrent()
      } else {
        current.push(tok)
      }
    }
    pushCurrent()

    for (const segment of segments) {
      if (segment.length === 1 && segment[0].type === 'image') {
        out.push(segment[0])
      } else {
        const segmentOpen = new Token('paragraph_open', 'p', 1)
        segmentOpen.hidden = open.hidden
        const inline = new Token('inline', '', 0)
        inline.children = segment
        inline.content = segment.map((tok) => tok.content ?? '').join('')
        const segmentClose = new Token('paragraph_close', 'p', -1)
        segmentClose.hidden = open.hidden
        out.push(segmentOpen, inline, segmentClose)
      }
    }
  }

  for (const tok of tokens) {
    if (tok.type === 'blockquote_open') {
      quoteDepth++
      out.push(tok)
      continue
    }
    if (tok.type === 'blockquote_close') {
      quoteDepth--
      out.push(tok)
      continue
    }
    if (tok.type === 'paragraph_open') {
      paraOpen = tok
      paraTokens = []
      continue
    }
    if (tok.type === 'paragraph_close') {
      paraClose = tok
      emitParagraph()
      continue
    }
    if (paraTokens) {
      paraTokens.push(tok)
      continue
    }
    out.push(tok)
  }
  emitParagraph()
  return out
}

// A URL alone on a line is treated as an embed card, the same way typing or
// pasting a URL into an empty line inserts a card. Rewrite paragraphs whose
// inline content is exactly one bare URL (no scheme is required, but the whole
// line must be the URL) into a standalone `embed` token. Inside a blockquote —
// which may only hold paragraphs — or a list item the URL is left as plain
// text (matching the editor, where typing/pasting a URL inside a list degrades
// to a link mark instead of a card).
function liftEmbedsFromParagraphs(tokens: Token[]): Token[] {
  const out: Token[] = []
  let quoteDepth = 0
  let listItemDepth = 0
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === 'blockquote_open') quoteDepth++
    if (tok.type === 'blockquote_close') quoteDepth--
    if (tok.type === 'list_item_open') listItemDepth++
    if (tok.type === 'list_item_close') listItemDepth--
    if (tok.type !== 'paragraph_open') {
      out.push(tok)
      continue
    }
    const inline = tokens[i + 1]
    const close = tokens[i + 2]
    if (quoteDepth > 0 || listItemDepth > 0 || !inline || inline.type !== 'inline' || !close || close.type !== 'paragraph_close') {
      out.push(tok)
      continue
    }
    const children = inline.children ?? []
    const text = children.length === 1 && children[0].type === 'text' ? children[0].content.trim() : ''
    if (!text || !URL_RE.test(text)) {
      out.push(tok)
      continue
    }
    const embed = new Token('embed', 'div', 0)
    embed.attrSet('href', text)
    out.push(embed)
    i += 2
  }
  return out
}

// List items may only hold paragraphs, so rewrite the token stream so any
// non-paragraph block inside a list item degrades or moves out: headings become
// paragraphs, code blocks become one paragraph per line, horizontal rules are
// dropped, and nested lists are flattened into their item's paragraphs.
// Otherwise `MarkdownParser` would silently drop the whole list when the
// content fails to fit the `paragraph+` schema. Block images cannot live inside
// a list item either, so each is lifted out into a standalone block right after
// the list; an item left with no paragraphs (and a list left with no items) is
// dropped, matching what the node-level normalization does on the HTML path.
function normalizeListTokens(tokens: Token[]): Token[] {
  const out: Token[] = []
  let listDepth = 0
  let itemDepth = 0
  let itemTokens: Token[] | null = null
  let itemHasParagraph = false
  let itemDeferredImage = false
  let listHasItems = false
  let listStart = -1
  const pendingImages: Token[] = []

  const flushItem = (): void => {
    if (!itemTokens) return
    // A genuinely empty item (`- `) keeps an empty paragraph; an item whose
    // only content was lifted out (an image) is dropped instead.
    const isEmpty = itemTokens.length === 0 && !itemDeferredImage
    if (itemHasParagraph || isEmpty) {
      out.push(new Token('list_item_open', 'li', 1), ...itemTokens, new Token('list_item_close', 'li', -1))
      listHasItems = true
    }
    itemTokens = null
    itemHasParagraph = false
    itemDeferredImage = false
  }

  for (const tok of tokens) {
    switch (tok.type) {
      case 'bullet_list_open':
      case 'ordered_list_open':
        if (listDepth === 0) {
          listStart = out.length
          listHasItems = false
          out.push(tok)
        }
        listDepth++
        continue
      case 'bullet_list_close':
      case 'ordered_list_close':
        listDepth--
        if (listDepth === 0) {
          flushItem()
          if (listHasItems) {
            out.push(tok)
          } else if (listStart >= 0) {
            out.splice(listStart, 1)
          }
          if (pendingImages.length) {
            out.push(...pendingImages)
            pendingImages.length = 0
          }
          listStart = -1
        }
        continue
      case 'list_item_open':
        if (itemDepth === 0) {
          itemTokens = []
          itemHasParagraph = false
        }
        itemDepth++
        continue
      case 'list_item_close':
        itemDepth--
        if (itemDepth === 0) flushItem()
        continue
      case 'paragraph_open':
      case 'inline':
      case 'paragraph_close':
        if (itemTokens) {
          itemTokens.push(tok)
          if (tok.type === 'paragraph_open') itemHasParagraph = true
        } else {
          out.push(tok)
        }
        continue
      case 'heading_open':
        if (itemTokens) {
          itemTokens.push(new Token('paragraph_open', 'p', 1))
          itemHasParagraph = true
        } else {
          out.push(tok)
        }
        continue
      case 'heading_close':
        if (itemTokens) itemTokens.push(new Token('paragraph_close', 'p', -1))
        else out.push(tok)
        continue
      case 'code_block':
      case 'fence':
        if (itemTokens) {
          const lines = tok.content.split('\n')
          if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
          if (!lines.length) lines.push('')
          for (const line of lines) {
            itemTokens.push(new Token('paragraph_open', 'p', 1))
            const text = new Token('text', '', 0)
            text.content = line
            itemTokens.push(text)
            itemTokens.push(new Token('paragraph_close', 'p', -1))
            itemHasParagraph = true
          }
        } else {
          out.push(tok)
        }
        continue
      case 'hr':
        // Dropped inside a list item (like inside a blockquote).
        if (itemTokens) continue
        out.push(tok)
        continue
      case 'image':
        if (itemTokens) {
          pendingImages.push(tok)
          itemDeferredImage = true
        } else {
          out.push(tok)
        }
        continue
      default:
        if (itemTokens) itemTokens.push(tok)
        else out.push(tok)
    }
  }
  flushItem()
  if (pendingImages.length) out.push(...pendingImages)
  return out
}

// The parser is fed a tokenizer whose `parse` rewrites non-paragraph blockquote
// content first (see `normalizeBlockquoteTokens`), then lifts images out of
// paragraphs (see `liftImagesFromParagraphs`), then turns lone-URL paragraphs
// into embed cards (see `liftEmbedsFromParagraphs`), then makes list items
// paragraph-only (see `normalizeListTokens`).
const blockquoteSafeTokenizer = {
  parse(text: string, env?: unknown): Token[] {
    return normalizeListTokens(
      liftEmbedsFromParagraphs(liftImagesFromParagraphs(normalizeBlockquoteTokens(tokenizer.parse(text, env)))),
    )
  },
}

export const markdownParser = new MarkdownParser(
  schema,
  blockquoteSafeTokenizer as unknown as MarkdownIt,
  parseTokens,
)

function escapeUrl(url: string): string {
  return url.replace(/[()]/g, '\\$&')
}

const markdownNodes = {
  blockquote(state: MarkdownSerializerState, node: PMNode) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node))
  },
  code_block(state: MarkdownSerializerState, node: PMNode) {
    const backticks = (node.textContent ?? '').match(/`{3,}/gm)
    const fence = backticks ? backticks.sort().slice(-1)[0] + '`' : '```'
    state.write(fence + (node.attrs.language || '') + '\n')
    state.text(node.textContent ?? '', false)
    state.write('\n')
    state.write(fence)
    state.closeBlock(node)
  },
  heading(state: MarkdownSerializerState, node: PMNode) {
    state.write(state.repeat('#', node.attrs.level) + ' ')
    state.renderInline(node, false)
    state.closeBlock(node)
  },
  horizontal_rule(state: MarkdownSerializerState, node: PMNode) {
    state.write('---')
    state.closeBlock(node)
  },
  embed(state: MarkdownSerializerState, node: PMNode) {
    const { url } = node.attrs
    if (!url) return
    state.write(url)
    state.closeBlock(node)
  },
  bullet_list(state: MarkdownSerializerState, node: PMNode) {
    state.renderList(node, '  ', () => '* ')
  },
  ordered_list(state: MarkdownSerializerState, node: PMNode) {
    const start = node.attrs.order ?? 1
    const maxW = String(start + node.childCount - 1).length
    const space = state.repeat(' ', maxW + 2)
    state.renderList(node, space, (i) => {
      const nStr = String(start + i)
      return state.repeat(' ', maxW - nStr.length) + nStr + '. '
    })
  },
  list_item(state: MarkdownSerializerState, node: PMNode) {
    state.renderContent(node)
  },
  paragraph(state: MarkdownSerializerState, node: PMNode) {
    state.renderInline(node)
    state.closeBlock(node)
  },
  image(state: MarkdownSerializerState, node: PMNode) {
    const { url, alt, filename } = node.attrs
    if (!url) return
    state.write('![' + state.esc(alt || filename || '') + '](' + escapeUrl(url) + ')')
    state.closeBlock(node)
  },
  attachment(state: MarkdownSerializerState, node: PMNode) {
    const { url, alt, filename, contentType } = node.attrs
    const isImage =
      (contentType && /^image(\/|$)/.test(contentType)) || /\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(url || '')
    if (url) {
      if (isImage) {
        state.write('![' + state.esc(alt || filename || '') + '](' + escapeUrl(url) + ')')
      } else {
        state.write('[' + state.esc(filename || url) + '](' + escapeUrl(url) + ')')
      }
    }
  },
  hard_break(state: MarkdownSerializerState, node: PMNode, parent: PMNode, index: number) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        state.write('\\\n')
        return
      }
    }
  },
  text(state: MarkdownSerializerState, node: PMNode) {
    state.text(node.text ?? '', true)
  },
}

function backticksFor(node: PMNode, side: number): string {
  const ticks = /`+/g
  let m: RegExpExecArray | null
  let len = 0
  if (node.isText) {
    while ((m = ticks.exec(node.text ?? ''))) len = Math.max(len, m[0].length)
  }
  let result = len > 0 && side > 0 ? ' `' : '`'
  for (let i = 0; i < len; i++) result += '`'
  if (len > 0 && side < 0) result += ' '
  return result
}

const markdownMarks = {
  bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  spoiler: { open: '||', close: '||', mixable: true, expelEnclosingWhitespace: true },
  link: {
    open: '[',
    close(_state: MarkdownSerializerState, mark: Mark) {
      return (
        '](' +
        mark.attrs.href.replace(/[()"]/g, '\\$&') +
        (mark.attrs.title ? ' "' + mark.attrs.title.replace(/"/g, '\\"') + '"' : '') +
        ')'
      )
    },
    mixable: true,
  },
  code: {
    open(_state: MarkdownSerializerState, _mark: Mark, parent: PMNode, index: number) {
      return backticksFor(parent.child(index), -1)
    },
    close(_state: MarkdownSerializerState, _mark: Mark, parent: PMNode, index: number) {
      return backticksFor(parent.child(index - 1), 1)
    },
    escape: false,
  },
}

export const markdownSerializer = new MarkdownSerializer(markdownNodes, markdownMarks, { hardBreakNodeName: 'hard_break' })
