import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'
import type { ImageRequestDetail } from '../src/index'

function makeEditor(value = ''): Editor {
  return new Editor(document.createElement('div'), { value, toolbar: false, contextMenu: false })
}

function imageSrc(editor: Editor): string | null {
  const img = editor.element.querySelector<HTMLImageElement>('img[data-wryte-attachment]')
  return img?.getAttribute('src') ?? null
}

function overlay(editor: Editor): HTMLElement | null {
  return editor.element.querySelector<HTMLElement>('.wryte-progress')
}

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('external image source lifecycle', () => {
  it('fires wryte-image-request for images inserted via HTML and shows the current source', async () => {
    const editor = makeEditor()
    const requested: string[] = []
    editor.element.addEventListener('wryte-image-request', (event) => {
      requested.push((event as CustomEvent).detail.url)
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png" alt="photo"></p>')

    expect(requested).toEqual([])
    await nextTick()
    expect(requested).toEqual(['https://cdn.remote.com/photo.png'])
    // The original image stays visible until the host responds.
    expect(imageSrc(editor)).toBe('https://cdn.remote.com/photo.png')
    expect(editor.toMarkdown()).toBe('![photo](https://cdn.remote.com/photo.png)')
  })

  it('fires wryte-image-request for images in the initial document', async () => {
    const editor = makeEditor('![alt](https://cdn.remote.com/photo.png)')
    const requested: string[] = []
    // Listener attached after construction still catches the request, because
    // the initial scan is deferred to the next tick.
    editor.element.addEventListener('wryte-image-request', (event) => {
      requested.push((event as CustomEvent).detail.url)
    })
    await nextTick()
    expect(requested).toEqual(['https://cdn.remote.com/photo.png'])
  })

  it('does not re-request a URL that already responded', async () => {
    const editor = makeEditor()
    let requests = 0
    editor.element.addEventListener('wryte-image-request', (event) => {
      requests++
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.mine.com/photo.png' })
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()
    expect(requests).toBe(1)
    expect(imageSrc(editor)).toBe('https://cdn.mine.com/photo.png')
    // A later doc change must not re-fire the request.
    editor.insertString('after')
    await nextTick()
    expect(requests).toBe(1)
  })

  it('re-requests a URL when the image is removed and re-added', async () => {
    const editor = makeEditor()
    let requests = 0
    editor.element.addEventListener('wryte-image-request', () => requests++)
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()
    expect(requests).toBe(1)
    editor.loadMarkdown('')
    await nextTick()
    expect(requests).toBe(1)
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()
    expect(requests).toBe(2)
  })

  it('skips uploaded attachments (images with an id)', async () => {
    const editor = makeEditor()
    const requested: string[] = []
    editor.element.addEventListener('wryte-image-request', (event) => {
      requested.push((event as CustomEvent).detail.url)
    })
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.mine.com/uploaded.png' })
    })
    editor.insertFiles([new File(['bytes'], 'uploaded.png', { type: 'image/png' })])
    await nextTick()
    expect(imageSrc(editor)).toBe('https://cdn.mine.com/uploaded.png')
    // The uploaded image has an attachment id, so no image-source request.
    expect(requested).toEqual([])
  })

  it('sends the current attrs with the request', async () => {
    const editor = makeEditor()
    const captured: { attrs?: ImageRequestDetail['attrs'] } = {}
    editor.element.addEventListener('wryte-image-request', (event) => {
      captured.attrs = (event as CustomEvent).detail.attrs
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png" alt="hi" width="100"></p>')
    await nextTick()
    expect(captured.attrs?.url).toBe('https://cdn.remote.com/photo.png')
    expect(captured.attrs?.alt).toBe('hi')
    expect(captured.attrs?.width).toBe(100)
  })

  it('shows the circular progress overlay on progress() and hides it on respond()', async () => {
    const editor = makeEditor()
    let progress: ((f: number) => void) | null = null
    let respond: ((r: { url: string }) => void) | null = null
    editor.element.addEventListener('wryte-image-request', (event) => {
      const detail = (event as CustomEvent).detail as {
        progress: (f: number) => void
        respond: (r: { url: string }) => void
      }
      progress = detail.progress
      respond = detail.respond
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()

    const bar = overlay(editor)?.querySelector<SVGCircleElement>('.wryte-progress-bar')
    expect(overlay(editor)?.hasAttribute('hidden')).toBe(true)
    progress!(0.42)
    expect(overlay(editor)?.hasAttribute('hidden')).toBe(false)
    expect(bar!.style.strokeDashoffset).toBe('51.01946469429824')

    respond!({ url: 'https://cdn.mine.com/photo.png' })
    expect(overlay(editor)?.hasAttribute('hidden')).toBe(true)
    expect(imageSrc(editor)).toBe('https://cdn.mine.com/photo.png')
  })

  it('swaps the source on respond and keeps missing attributes', async () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-image-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.mine.com/new.png', alt: 'new alt' })
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png" alt="old" width="320"></p>')
    await nextTick()
    expect(imageSrc(editor)).toBe('https://cdn.mine.com/new.png')
    const img = editor.element.querySelector<HTMLImageElement>('img[data-wryte-attachment]')
    expect(img?.getAttribute('alt')).toBe('new alt')
    expect(editor.toMarkdown()).toBe('![new alt](https://cdn.mine.com/new.png)')
  })

  it('fires wryte-image-success after a successful respond', async () => {
    const editor = makeEditor()
    const events: string[] = []
    editor.element.addEventListener('wryte-image-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.mine.com/photo.png' })
    })
    editor.element.addEventListener('wryte-image-success', (event) => {
      events.push((event as CustomEvent).detail.url)
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()
    expect(events).toEqual(['https://cdn.remote.com/photo.png'])
  })

  it('resets the overlay and fires wryte-image-error on respond({ error })', async () => {
    const editor = makeEditor()
    let progress: ((f: number) => void) | null = null
    let respond: ((r: { error: { message: string } }) => void) | null = null
    const errors: string[] = []
    editor.element.addEventListener('wryte-image-request', (event) => {
      const detail = (event as CustomEvent).detail as {
        progress: (f: number) => void
        respond: (r: { error: { message: string } }) => void
      }
      progress = detail.progress
      respond = detail.respond
    })
    editor.element.addEventListener('wryte-image-error', (event) => {
      errors.push((event as CustomEvent).detail.error.message)
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()

    progress!(0.5)
    expect(overlay(editor)?.hasAttribute('hidden')).toBe(false)
    respond!({ error: { message: 'download failed' } })
    expect(overlay(editor)?.hasAttribute('hidden')).toBe(true)
    expect(imageSrc(editor)).toBe('https://cdn.remote.com/photo.png')
    expect(errors).toEqual(['download failed'])
  })

  it('requests a shared URL once and swaps every matching image', async () => {
    const editor = makeEditor()
    let requests = 0
    editor.element.addEventListener('wryte-image-request', (event) => {
      requests++
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.mine.com/photo.png' })
    })
    editor.loadHTML(
      '<p><img src="https://cdn.remote.com/photo.png"></p><p>text</p><p><img src="https://cdn.remote.com/photo.png"></p>',
    )
    await nextTick()
    expect(requests).toBe(1)
    const srcs = Array.from(editor.element.querySelectorAll('img[data-wryte-attachment]')).map((img) =>
      img.getAttribute('src'),
    )
    expect(srcs).toEqual(['https://cdn.mine.com/photo.png', 'https://cdn.mine.com/photo.png'])
  })

  it('dispatches image events that bubble to document', async () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = new Editor(element, { toolbar: false, contextMenu: false })
    const seen: string[] = []
    document.addEventListener('wryte-image-request', (event) => {
      seen.push((event as CustomEvent).detail.url)
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.mine.com/photo.png' })
    })
    editor.loadHTML('<p><img src="https://cdn.remote.com/photo.png"></p>')
    await nextTick()
    expect(seen).toEqual(['https://cdn.remote.com/photo.png'])
    element.remove()
    // Removing the editor destroys its EditorView, whose DOMObserver schedules
    // a 20ms flush timer. Let it fire inside the jsdom environment, or it races
    // the environment teardown and throws "document is not defined".
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
})
