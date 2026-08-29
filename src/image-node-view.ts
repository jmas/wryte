import type { Node as PMNode } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'
import { isVideo, type AttachmentAttrs } from './schema'

const RADIUS = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// A 1x1 transparent GIF. Used while the image has no URL yet so the browser
// never paints a broken-image icon (CSS pseudo-elements don't work on `<img>`).
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

// A small play triangle matching the tabler "player-play" glyph, shown in the
// corner of a block image that is a video card (a `video/*` content type).
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 4v16l13 -8z" /></svg>'

// Renders a block image as a wrapper div holding the `<img>` plus an
// absolutely-positioned progress circle. The circle is shown while the
// attachment's upload is pending (no url yet), and also while an external
// image is being re-processed by the host via `wryte-image-request` (the
// editor drives the latter imperatively with `setProcessing()`/`setProgress()`
// on request progress events). ProseMirror calls `update()` on every
// transaction touching the node (e.g. when the upload resolves and the `url`
// attr arrives).
//
// A block image whose `contentType` is `video/*` is a **video card**: the
// poster image (if any) is shown as the preview face and a small play button
// sits in the corner. Clicking the card NodeSelects it like a plain image
// (selection / alt / remove are the usual image affordances); clicking the
// play button swaps the preview for a real `<video controls autoplay>`.
export class ImageNodeView implements NodeView {
  dom: HTMLElement
  private img: HTMLImageElement
  private overlay: HTMLElement
  private bar: SVGCircleElement
  private play: HTMLElement
  private pending: boolean
  private progressValue = 0
  private currentUrl: string | null = null
  private posterUrl: string | null = null
  private isVideoCard = false
  private playing = false
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

    this.play = document.createElement('div')
    this.play.className = 'wryte-image-play'
    this.play.title = 'Play video'
    this.play.setAttribute('aria-label', 'Play video')
    this.play.innerHTML = PLAY_ICON
    // Don't let the click NodeSelect the card or blur the editor: the small
    // play button plays the video, clicking anywhere else on the card selects
    // it like a normal image.
    this.play.addEventListener('mousedown', (event) => event.preventDefault())
    this.play.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.enterPlayback()
    })
    this.dom.appendChild(this.play)

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
      this.play.hidden = true
      return
    }
    if (this.currentUrl != null) {
      this.overlay.hidden = true
    } else {
      this.overlay.hidden = !this.pending
      if (this.pending) this.setProgress(this.progressValue)
    }
    // The play button appears only on a video card whose media is resolved.
    this.play.hidden = !(this.isVideoCard && this.currentUrl != null)
  }

  // Swaps the preview face for a live `<video>` playing the uploaded file. The
  // player keeps the `data-wryte-attachment` id so attachment lookups keep
  // finding the card; clicks on it (and its native controls) stop at the
  // element so PM never NodeSelects mid-playback.
  private enterPlayback(): void {
    if (this.playing || this.currentUrl == null || !this.isVideoCard) return
    this.playing = true
    const video = document.createElement('video')
    video.className = 'wryte-video-player'
    video.src = this.currentUrl
    if (this.posterUrl) video.poster = this.posterUrl
    video.controls = true
    video.autoplay = true
    video.preload = 'metadata'
    video.setAttribute('data-wryte-attachment', this.img.getAttribute('data-wryte-attachment') ?? '')
    video.addEventListener('click', (event) => event.stopPropagation())
    this.play.hidden = true
    this.img.replaceWith(video)
  }

  private exitPlayback(): void {
    if (!this.playing) return
    this.playing = false
    this.dom.querySelector('video.wryte-video-player')?.remove()
    if (!this.img.isConnected) this.dom.insertBefore(this.img, this.overlay)
    this.updateOverlay()
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'image') return false
    const attrs = node.attrs as AttachmentAttrs
    const url = attrs.url ?? null
    this.posterUrl = attrs.poster ?? null
    this.isVideoCard = isVideo(attrs.contentType)
    if (url !== this.currentUrl) {
      this.currentUrl = url
      this.onUrlChange?.(url)
    }
    if (this.isVideoCard) {
      // A video card shows its poster as the preview (or a transparent
      // placeholder over the gray card while there is none), never the raw
      // video URL inside an `<img>`.
      this.img.setAttribute('src', this.posterUrl ?? TRANSPARENT_GIF)
    } else {
      this.img.setAttribute('src', url ?? TRANSPARENT_GIF)
    }
    this.img.setAttribute('alt', attrs.alt ?? '')
    if (this.playing && (!this.isVideoCard || url == null)) this.exitPlayback()
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
