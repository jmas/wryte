import { Schema, type DOMOutputSpec } from 'prosemirror-model'
import { extractHost, type EmbedAttrs } from './embed'

export interface AttachmentAttrs {
  id: string | null
  url: string | null
  href: string | null
  alt: string | null
  filename: string
  filesize: number | null
  contentType: string | null
  width: number | null
  height: number | null
  presentation: string | null
  // Poster/placeholder image URL for videos: the video card shows the poster
  // as its placeholder until it is played.
  poster: string | null
}

const previewablePattern = /^image(\/(gif|png|webp|jpe?g|\*)|$)/

export function isPreviewable(contentType: string | null): boolean {
  return contentType != null && previewablePattern.test(contentType)
}

// Videos are block nodes too: any `video/*` content type renders as a block
// video card (a poster-image placeholder with a play button).
export function isVideo(contentType: string | null): boolean {
  return contentType != null && /^video(\/|$)/.test(contentType)
}

// A block image whose src points at a video file (`.mp4` etc.) is treated as a
// video card: the `contentType` attr is set to `video/*` so the node view
// renders the poster/play placeholder instead of a broken `<img>`. Used by the
// HTML parser and the markdown parser to classify pasted/loaded video URLs.
const VIDEO_EXTENSION = /\.(mp4|m4v|webm|ogv|ogg|mov)(\?.*)?$/i
export function isVideoSrc(src: string | null): boolean {
  return src != null && VIDEO_EXTENSION.test(src)
}

export const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      defining: true,
      attrs: { level: { default: 2 } },
      parseDOM: [
        { tag: 'h1', attrs: { level: 2 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 3 } },
        { tag: 'h5', attrs: { level: 3 } },
        { tag: 'h6', attrs: { level: 3 } },
      ],
      toDOM: (node) => ['h' + node.attrs.level, 0],
    },
    blockquote: {
      group: 'block',
      content: 'paragraph+',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    bullet_list: {
      group: 'block',
      content: 'list_item+',
      attrs: { tight: { default: false } },
      parseDOM: [{ tag: 'ul' }],
      toDOM: (node) => ['ul', { 'data-tight': node.attrs.tight ? 'true' : null }, 0],
    },
    ordered_list: {
      group: 'block',
      content: 'list_item+',
      attrs: {
        order: { default: 1 },
        tight: { default: false },
      },
      parseDOM: [
        {
          tag: 'ol',
          getAttrs: (dom) => ({ order: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) : 1 }),
        },
      ],
      toDOM: (node) => ['ol', { start: node.attrs.order === 1 ? null : node.attrs.order }, 0],
    },
    // List items may only hold paragraphs (inline content): no headings,
    // images, embeds, code blocks, rules or nested lists inside a list.
    list_item: {
      content: 'paragraph+',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
    },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: { language: { default: null } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (dom) => {
            const code = dom.firstElementChild
            const language =
              (code?.getAttribute('data-language') ??
                code?.getAttribute('class')?.match(/language-(\S+)/)?.[1] ??
                null) ?? null
            return { language }
          },
        },
      ],
      toDOM: (node) => [
        'pre',
        ['code', node.attrs.language ? { class: 'language-' + node.attrs.language, 'data-language': node.attrs.language } : {}, 0],
      ],
    },
    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
    embed: {
      group: 'block',
      atom: true,
      draggable: true,
      attrs: {
        url: { default: null },
        host: { default: null },
        title: { default: null },
        image: { default: null },
      },
      parseDOM: [
        {
          tag: 'div.wryte-embed',
          getAttrs: (dom) => {
            const element = dom as HTMLElement
            const url = element.getAttribute('data-wryte-url')
            return {
              url,
              host: element.querySelector('.wryte-embed-host')?.textContent?.trim() || extractHost(url),
              title: element.querySelector('.wryte-embed-title')?.textContent || null,
              image: element.querySelector('img.wryte-embed-image')?.getAttribute('src') || null,
            }
          },
        },
      ],
      toDOM: (node): DOMOutputSpec => {
        const attrs = node.attrs as EmbedAttrs
        const children: DOMOutputSpec[] = []
        if (attrs.image) children.push(['img', { class: 'wryte-embed-image', src: attrs.image, alt: '' }])
        const body: DOMOutputSpec[] = []
        if (attrs.title) body.push(['div', { class: 'wryte-embed-title' }, attrs.title])
        body.push(['div', { class: 'wryte-embed-host' }, attrs.host || extractHost(attrs.url) || ''])
        children.push(['div', { class: 'wryte-embed-body' }, ...body])
        return ['div', { class: 'wryte-embed', 'data-wryte-url': attrs.url ?? null }, ...children]
      },
    },
    image: {
      group: 'block',
      atom: true,
      draggable: true,
      attrs: {
        id: { default: null },
        url: { default: null },
        href: { default: null },
        alt: { default: null },
        filename: { default: '' },
        filesize: { default: null },
        contentType: { default: null },
        width: { default: null },
        height: { default: null },
        presentation: { default: null },
        poster: { default: null },
      },
      parseDOM: [
        {
          tag: 'img',
          getAttrs: (dom) => {
            const src = dom.getAttribute('src')
            return {
              url: src,
              alt: dom.getAttribute('alt'),
              // A `video/*` content type marks a block image as a video card
              // (the src is a video file whose poster/preview is shown instead).
              // Sniffed from the extension so loaded/pasted video URLs degrade
              // to a playable card instead of a broken `<img>`.
              contentType: isVideoSrc(src) ? 'video/*' : 'image/*',
              poster: dom.getAttribute('data-wryte-poster'),
              width: dom.getAttribute('width') ? Number(dom.getAttribute('width')) : null,
              height: dom.getAttribute('height') ? Number(dom.getAttribute('height')) : null,
            }
          },
        },
      ],
      toDOM: (node) => {
        const attrs = node.attrs as AttachmentAttrs
        return [
          'img',
          {
            src: attrs.url ?? '',
            alt: attrs.alt ?? '',
            'data-wryte-attachment': attrs.id ?? '',
            'data-wryte-poster': attrs.poster ?? null,
          },
        ]
      },
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
    text: {
      group: 'inline',
    },
    attachment: {
      inline: true,
      group: 'inline',
      atom: true,
      draggable: true,
      attrs: {
        id: { default: null },
        url: { default: null },
        href: { default: null },
        alt: { default: null },
        filename: { default: '' },
        filesize: { default: null },
        contentType: { default: null },
        width: { default: null },
        height: { default: null },
        presentation: { default: null },
      },
      parseDOM: [
        {
          tag: 'span[data-wryte-attachment]',
          getAttrs: (dom) => ({
            url: dom.getAttribute('data-wryte-url'),
            href: dom.getAttribute('data-wryte-href'),
            alt: dom.getAttribute('alt'),
            filename: dom.textContent ?? '',
            width: dom.getAttribute('width') ? Number(dom.getAttribute('width')) : null,
            height: dom.getAttribute('height') ? Number(dom.getAttribute('height')) : null,
          }),
        },
      ],
      toDOM: (node) => {
        const attrs = node.attrs as AttachmentAttrs
        return [
          'span',
          {
            'data-wryte-attachment': attrs.id ?? '',
            'data-wryte-url': attrs.url ?? null,
            title: attrs.filename || '',
            'data-wryte-href': attrs.href ?? null,
          },
          attrs.filename || 'attachment',
        ]
      },
    },
  },
  marks: {
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b', getAttrs: (node) => (node.style.fontWeight !== 'normal' ? null : false) },
        { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
      ],
      toDOM: () => ['strong', 0],
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    strike: {
      parseDOM: [{ tag: 'del' }, { tag: 's' }, { tag: 'strike' }],
      toDOM: () => ['del', 0],
    },
    spoiler: {
      parseDOM: [{ tag: 'span.wryte-spoiler' }, { tag: 'span.spoiler' }, { tag: 'span[data-spoiler]' }],
      toDOM: () => ['span', { class: 'wryte-spoiler' }, 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title') }),
        },
      ],
      toDOM: (node) => ['a', { href: node.attrs.href, title: node.attrs.title ?? null }, 0],
    },
  },
})
