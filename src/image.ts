import { EventName, dispatchWryteEvent } from './events'
import type { Editor } from './editor'
import type { AttachmentAttrs } from './schema'
import type { ImageNodeView } from './image-node-view'

export interface ImageErrorResult {
  error: { message: string }
}

export interface ImageResult {
  url?: string | null
  href?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
  // Poster/preview image for a video-card image (a `video/*` content type),
  // so a video URL loaded from markdown gets its placeholder face back.
  poster?: string | null
  [key: string]: unknown
}

export type ImageRequestResult = ImageResult | ImageErrorResult

export interface ImageRequestDetail {
  editor: Editor
  url: string
  attrs: AttachmentAttrs
  respond(result: ImageRequestResult): void
  progress(fraction: number): void
}

// Drives the external-image-source lifecycle through bubbling DOM events,
// mirroring the embed flow: whenever an `image` node without an attachment id
// (i.e. a pasted/loaded image, not an uploaded one) appears in the document,
// the editor dispatches `wryte-image-request` and a listener re-processes the
// source — e.g. downloading it to the host's own CDN — calling `progress()`
// along the way and `respond({ url, ... })` to swap the image to the new URL.
// The original image stays visible the whole time; the circular progress
// overlay appears once `progress()` is first called and hides on `respond`.
// Each URL is requested once until it leaves the document. The editor never
// re-processes sources itself.
export class ImageManager {
  private requested = new Set<string>()
  private nodeViews = new Map<string | null, Set<ImageNodeView>>()
  private registeredUrl = new WeakMap<ImageNodeView, string | null>()

  constructor(private editor: Editor) {}

  // The editor's node-view factory registers every image node view so the
  // manager can drive the progress circle on the right DOM. Views are re-keyed
  // when their `url` attr changes (`update()`), and dropped on destroy.
  registerNodeView(view: ImageNodeView, url: string | null): void {
    this.unregisterNodeView(view)
    const set = this.nodeViews.get(url) ?? new Set<ImageNodeView>()
    set.add(view)
    this.nodeViews.set(url, set)
    this.registeredUrl.set(view, url)
  }

  unregisterNodeView(view: ImageNodeView): void {
    const url = this.registeredUrl.get(view)
    if (url === undefined) return
    const set = this.nodeViews.get(url)
    set?.delete(view)
    if (set?.size === 0) this.nodeViews.delete(url)
    this.registeredUrl.delete(view)
  }

  refresh(): void {
    const urls = new Set<string>()
    const attrsByUrl = new Map<string, AttachmentAttrs>()
    this.editor.editorView.state.doc.descendants((node) => {
      if (node.type.name === 'image' && node.attrs.url && !node.attrs.id) {
        urls.add(node.attrs.url)
        if (!attrsByUrl.has(node.attrs.url)) attrsByUrl.set(node.attrs.url, node.attrs as AttachmentAttrs)
      }
    })
    for (const url of this.requested) if (!urls.has(url)) this.requested.delete(url)
    for (const url of urls) {
      if (this.requested.has(url)) continue
      this.requested.add(url)
      this.requestImage(url, attrsByUrl.get(url) as AttachmentAttrs)
    }
  }

  private requestImage(url: string, attrs: AttachmentAttrs): void {
    let responded = false
    const respond = (result: ImageRequestResult): void => {
      if (responded) return
      responded = true
      this.reset(url)
      if ('error' in result && result.error) {
        dispatchWryteEvent(this.editor.element, EventName.imageError, {
          editor: this.editor,
          url,
          error: result.error,
        })
      } else {
        const success = result as ImageResult
        // Mark the resolved URL requested too, so a successful swap never
        // re-requests the same source (the old URL leaves the doc anyway).
        this.requested.add(success.url ?? url)
        this.editor.succeedImage(url, success)
      }
    }
    const progress = (fraction: number): void => {
      for (const view of this.nodeViews.get(url) ?? []) {
        view.setProcessing(true)
        view.setProgress(fraction)
      }
    }
    dispatchWryteEvent(this.editor.element, EventName.imageRequest, {
      editor: this.editor,
      url,
      attrs,
      respond,
      progress,
    })
  }

  private reset(url: string): void {
    for (const view of this.nodeViews.get(url) ?? []) view.setProcessing(false)
  }
}
