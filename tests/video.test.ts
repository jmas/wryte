import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'
import { isVideo, isVideoSrc } from '../src/schema'

function makeEditor(value: string | Record<string, unknown> = '', options: Record<string, unknown> = {}): Editor {
  const opts: Record<string, unknown> =
    typeof value === 'string' ? { value, ...options } : { ...value, ...options }
  return new Editor(document.createElement('div'), { toolbar: false, contextMenu: false, ...opts })
}

function videoFile(name = 'clip.mp4'): File {
  return new File(['bytes'], name, { type: 'video/mp4' })
}

function blockTypes(editor: Editor): string[] {
  return (editor.getDocument().toJSON() as { content?: { type: string }[] }).content?.map((c) => c.type) ?? []
}

function card(editor: Editor): HTMLElement | null {
  return editor.element.querySelector<HTMLElement>('.wryte-image')
}

function cardImg(editor: Editor): HTMLImageElement | null {
  return editor.element.querySelector<HTMLImageElement>('.wryte-image img[data-wryte-attachment]')
}

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('video upload lifecycle', () => {
  it('inserts a video file as a block image card, not an inline link', () => {
    const editor = makeEditor()
    editor.insertFiles([videoFile()])
    expect(blockTypes(editor)).toEqual(['image'])
    expect(card(editor)).not.toBeNull()
    expect(cardImg(editor)).not.toBeNull()
    expect(editor.getAttachments()).toHaveLength(1)
    expect(editor.getAttachments()[0].isVideo()).toBe(true)
  })

  it('shows a progress circle while the video upload is pending', () => {
    const editor = makeEditor()
    let progress: ((f: number) => void) | null = null
    editor.element.addEventListener('wryte-upload-request', (event) => {
      progress = (event as CustomEvent).detail.progress
    })

    editor.insertFiles([videoFile()])

    const overlay = card(editor)!.querySelector<HTMLElement>('.wryte-progress')
    expect(overlay).not.toBeNull()
    expect(overlay!.hasAttribute('hidden')).toBe(false)
    const bar = overlay!.querySelector<SVGCircleElement>('.wryte-progress-bar')
    progress!(0.42)
    expect(bar!.style.strokeDashoffset).toBe('51.01946469429824')
  })

  it('uses the responded poster image as the preview and shows a play button', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({
        url: 'https://cdn.example.com/clip.mp4',
        poster: 'https://cdn.example.com/poster.jpg',
      })
    })

    editor.insertFiles([videoFile()])

    const wrapper = card(editor)!
    // The preview is the poster image, never the raw video URL.
    expect(cardImg(editor)!.getAttribute('src')).toBe('https://cdn.example.com/poster.jpg')
    const play = wrapper.querySelector<HTMLElement>('.wryte-image-play')
    expect(play).not.toBeNull()
    expect(play!.hasAttribute('hidden')).toBe(false)
    // The upload resolved, so the progress circle is gone.
    expect(wrapper.querySelector<HTMLElement>('.wryte-progress')!.hasAttribute('hidden')).toBe(true)
    expect(editor.getAttachments()[0].getAttribute('poster')).toBe('https://cdn.example.com/poster.jpg')
  })

  it('shows a play button on the gray placeholder even without a poster', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.example.com/clip.mp4' })
    })

    editor.insertFiles([videoFile()])

    const wrapper = card(editor)!
    expect(cardImg(editor)!.getAttribute('src')).toBe(
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    )
    expect(wrapper.querySelector<HTMLElement>('.wryte-image-play')!.hasAttribute('hidden')).toBe(false)
  })

  it('clicks the play button to swap in a real video player', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({
        url: 'https://cdn.example.com/clip.mp4',
        poster: 'https://cdn.example.com/poster.jpg',
      })
    })

    editor.insertFiles([videoFile()])

    const wrapper = card(editor)!
    wrapper.querySelector<HTMLElement>('.wryte-image-play')!.click()

    const video = wrapper.querySelector<HTMLVideoElement>('video.wryte-video-player')
    expect(video).not.toBeNull()
    expect(video!.getAttribute('src')).toBe('https://cdn.example.com/clip.mp4')
    expect(video!.getAttribute('poster')).toBe('https://cdn.example.com/poster.jpg')
    expect(video!.hasAttribute('controls')).toBe(true)
    expect(video!.hasAttribute('autoplay')).toBe(true)
    expect(wrapper.querySelector('img[data-wryte-attachment]')).toBeNull()
  })

  it('degrades video files to inline attachments when the video ability is off', () => {
    const editor = makeEditor({ abilities: ['attach'] })
    editor.insertFiles([videoFile()])
    expect(blockTypes(editor)).toEqual(['paragraph'])
    expect(editor.element.querySelector('span[data-wryte-attachment]')).not.toBeNull()
  })
})

describe('video serialization', () => {
  it('serializes a video card to markdown as an image with the video URL', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      ;(event as CustomEvent).detail.respond({ url: 'https://cdn.example.com/clip.mp4' })
    })
    editor.insertFiles([videoFile('clip.mp4')])
    expect(editor.toMarkdown()).toBe('![clip.mp4](https://cdn.example.com/clip.mp4)')
  })

  it('round-trips the poster through HTML', () => {
    const editor = makeEditor()
    editor.loadHTML(
      '<img src="https://e.com/c.mp4" alt="clip" data-wryte-poster="https://e.com/p.jpg">',
    )
    const img = cardImg(editor)
    expect(img).not.toBeNull()
    // A video-extension src is classified as a video card on load.
    expect(editor.getDocument().child(0).attrs.contentType).toBe('video/*')
    const html = editor.toHTML()
    expect(html).toContain('https://e.com/c.mp4')
    expect(html).toContain('data-wryte-poster="https://e.com/p.jpg"')
  })

  it('requests a poster for a video URL loaded from markdown and applies it', async () => {
    const editor = makeEditor('![clip](https://cdn.example.com/clip.mp4)')
    let respond: ((r: { poster: string }) => void) | null = null
    editor.element.addEventListener('wryte-image-request', (event) => {
      const detail = (event as CustomEvent).detail as { attrs: { contentType?: string | null }; respond: (r: { poster: string }) => void }
      expect(detail.attrs.contentType).toBe('video/*')
      respond = detail.respond
    })
    await nextTick()
    expect(respond).not.toBeNull()
    // No poster yet: the card shows the gray placeholder with a play button.
    expect(cardImg(editor)!.getAttribute('src')).toBe(
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    )
    respond!({ poster: 'https://cdn.example.com/poster.jpg' })
    expect(cardImg(editor)!.getAttribute('src')).toBe('https://cdn.example.com/poster.jpg')
    expect(editor.toMarkdown()).toBe('![clip](https://cdn.example.com/clip.mp4)')
  })
})

describe('isVideo', () => {
  it('recognizes video content types', () => {
    expect(isVideo('video/mp4')).toBe(true)
    expect(isVideo('video/webm')).toBe(true)
    expect(isVideo('video/ogg')).toBe(true)
    expect(isVideo('video/*')).toBe(true)
  })

  it('rejects non-video content types', () => {
    expect(isVideo('image/png')).toBe(false)
    expect(isVideo('application/pdf')).toBe(false)
    expect(isVideo(null)).toBe(false)
  })
})

describe('isVideoSrc', () => {
  it('recognizes video file extensions', () => {
    expect(isVideoSrc('https://cdn.example.com/clip.mp4')).toBe(true)
    expect(isVideoSrc('https://cdn.example.com/clip.m4v?token=1')).toBe(true)
    expect(isVideoSrc('https://cdn.example.com/clip.webm')).toBe(true)
    expect(isVideoSrc('https://cdn.example.com/clip.mov')).toBe(true)
  })

  it('rejects non-video URLs', () => {
    expect(isVideoSrc('https://cdn.example.com/photo.png')).toBe(false)
    expect(isVideoSrc('https://cdn.example.com/photo.jpg?v=2')).toBe(false)
    expect(isVideoSrc(null)).toBe(false)
  })
})
