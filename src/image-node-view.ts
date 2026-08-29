import type { Node as PMNode } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'
import type { AttachmentAttrs } from './schema'

const RADIUS = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// A 1x1 transparent GIF. Used while the image has no URL yet so the browser
// never paints a broken-image icon (CSS pseudo-elements don't work on `<img>`).
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

// Renders a block image as a wrapper div holding the `<img>` plus an
// absolutely-positioned progress circle. The circle is shown while the
// attachment's upload is pending (no url yet), and also while an external
// image is being re-processed by the host via `wryte-image-request` (the
// editor drives the latter imperatively with `setProcessing()`/`setProgress()`
// on request progress events). ProseMirror calls `update()` on every
// transaction touching the node (e.g. when the upload resolves and the `url`
// attr arrives).
export class ImageNodeView implements NodeView {
  dom: HTMLElement
  private img: HTMLImageElement
  private overlay: HTMLElement
  private bar: SVGCircleElement
  private pending: boolean
  private progressValue = 0
  private currentUrl: string | null = null
  private processing = false
  private onUrlChange: ((url: string | null) => void) | null
  private onDestroy: (() => void) | null

  constructor(
    node: PMNode,
    pending: boolean,
    initialProgress = 0,
    onUrlChange?: (url: string | null) => void,
    onDestroy?: () => void,
  ) {
    this.pending = pending
    this.onUrlChange = onUrlChange ?? null
    this.onDestroy = onDestroy ?? null
    const attrs = node.attrs as AttachmentAttrs

    this.dom = document.createElement('div')
    this.dom.className = 'wryte-image'

    this.img = document.createElement('img')
    this.img.setAttribute('data-wryte-attachment', attrs.id ?? '')
    this.dom.appendChild(this.img)

    this.overlay = document.createElement('div')
    this.overlay.className = 'wryte-progress'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 32 32')
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    track.setAttribute('class', 'wryte-progress-track')
    track.setAttribute('cx', '16')
    track.setAttribute('cy', '16')
    track.setAttribute('r', String(RADIUS))
    this.bar = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    this.bar.setAttribute('class', 'wryte-progress-bar')
    this.bar.setAttribute('cx', '16')
    this.bar.setAttribute('cy', '16')
    this.bar.setAttribute('r', String(RADIUS))
    this.bar.style.strokeDasharray = String(CIRCUMFERENCE)
    svg.appendChild(track)
    svg.appendChild(this.bar)
    this.overlay.appendChild(svg)
    this.dom.appendChild(this.overlay)

    // Seed `currentUrl` so the initial `update()` doesn't fire `onUrlChange`
    // (the view isn't fully constructed yet — the caller registers it after).
    this.currentUrl = attrs.url ?? null
    this.setProgress(initialProgress)
    this.update(node)
  }

  setProgress(fraction: number): void {
    this.progressValue = Math.max(0, Math.min(1, fraction))
    this.bar.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - this.progressValue))
  }

  // Force the progress circle on top of the visible image while the host
  // re-processes the source (e.g. uploading it to its own CDN). Overrides the
  // url-derived visibility until `setProcessing(false)`.
  setProcessing(processing: boolean): void {
    if (this.processing === processing) return
    this.processing = processing
    this.updateOverlay()
  }

  private updateOverlay(): void {
    if (this.processing) {
      this.overlay.hidden = false
      return
    }
    if (this.currentUrl != null) {
      this.overlay.hidden = true
    } else {
      this.overlay.hidden = !this.pending
      if (this.pending) this.setProgress(this.progressValue)
    }
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'image') return false
    const attrs = node.attrs as AttachmentAttrs
    const url = attrs.url ?? null
    if (url !== this.currentUrl) {
      this.currentUrl = url
      this.onUrlChange?.(url)
    }
    this.img.setAttribute('src', attrs.url ?? TRANSPARENT_GIF)
    this.img.setAttribute('alt', attrs.alt ?? '')
    this.updateOverlay()
    return true
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    this.onDestroy?.()
  }
}
