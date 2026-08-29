import { EventName, dispatchWryteEvent } from './events'
import type { Editor } from './editor'

// A URL alone on a line becomes an embed card. The regex accepts scheme-less
// domains (`example.com/path`) as well as `http(s)://` URLs; a TLD must be at
// least two letters so `1.5` or `v1.2` never become embeds.
export const URL_RE = /^(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i

export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed
}

export function extractHost(url: string | null): string | null {
  if (!url) return null
  try {
    const host = new URL(normalizeUrl(url)).host
    return host ? host.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

export interface EmbedAttrs {
  url: string | null
  host: string | null
  title: string | null
  image: string | null
}

export interface EmbedResult {
  title?: string | null
  image?: string | null
  host?: string | null
}

export interface EmbedRequestDetail {
  editor: Editor
  url: string
  respond(result: EmbedResult): void
}

// Drives the embed-card fill lifecycle through bubbling DOM events, mirroring
// the upload flow: whenever a `embed` node appears in the document, the editor
// dispatches `wryte-embed-request` (from the editor element or anywhere up the
// tree) and a listener fills the card via `respond({ title, image, host })`.
// Each URL is requested once until it leaves the document, so cards are not
// re-fetched on every keystroke.
export class EmbedManager {
  private requested = new Set<string>()

  constructor(private editor: Editor) {}

  refresh(): void {
    const urls = new Set<string>()
    this.editor.editorView.state.doc.descendants((node) => {
      if (node.type.name === 'embed' && node.attrs.url) urls.add(node.attrs.url)
    })
    for (const url of this.requested) if (!urls.has(url)) this.requested.delete(url)
    for (const url of urls) {
      if (this.requested.has(url)) continue
      this.requested.add(url)
      this.requestEmbed(url)
    }
  }

  private requestEmbed(url: string): void {
    let responded = false
    const respond = (result: EmbedResult): void => {
      if (responded) return
      responded = true
      this.editor.succeedEmbed(url, result)
    }
    dispatchWryteEvent(this.editor.element, EventName.embedRequest, { editor: this.editor, url, respond })
  }
}
