import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'
import type { UploadSuccessResult } from '../src/index'

function makeEditor(): Editor {
  return new Editor(document.createElement('div'), { toolbar: false })
}

function imageFile(name = 'photo.png'): File {
  return new File(['bytes'], name, { type: 'image/png' })
}

describe('upload lifecycle', () => {
  it('rejects files via wryte-file-accept', () => {
    const editor = makeEditor()
    const rejected: File[] = []
    editor.element.addEventListener('wryte-file-accept', (event) => {
      rejected.push((event as CustomEvent).detail.file)
      event.preventDefault()
    })
    const fileRejects: string[] = []
    editor.element.addEventListener('wryte-file-reject', (event) => {
      fileRejects.push((event as CustomEvent).detail.reason)
    })

    editor.insertFiles([imageFile()])
    expect(rejected).toHaveLength(1)
    expect(fileRejects).toHaveLength(1)
    expect(editor.toMarkdown()).toBe('')
  })

  it('requests uploads and resolves via respond()', async () => {
    const editor = makeEditor()
    const requested: Array<{ file: File; respond: (r: UploadSuccessResult) => void }> = []
    const added: string[] = []

    editor.element.addEventListener('wryte-attachment-add', (event) => {
      added.push((event as CustomEvent).detail.attachment.id)
    })
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as {
        file: File
        attachment: { id: string; isPending: () => boolean }
        respond: (r: UploadSuccessResult) => void
      }
      expect(detail.attachment.isPending()).toBe(true)
      requested.push(detail)
      detail.respond({ url: 'https://cdn.example.com/photo.png', width: 100, height: 100 })
    })

    editor.insertFiles([imageFile()])

    expect(added).toHaveLength(1)
    expect(requested).toHaveLength(1)
    expect(editor.getAttachments()).toHaveLength(1)
    expect(editor.getAttachments()[0].isPending()).toBe(false)
    expect(editor.toMarkdown()).toBe('![photo.png](https://cdn.example.com/photo.png)')
  })

  it('fails uploads via respond({ error })', () => {
    const editor = makeEditor()
    const errors: string[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: { error: { message: string } }) => void }
      detail.respond({ error: { message: 'too big' } })
    })
    editor.element.addEventListener('wryte-upload-error', (event) => {
      errors.push((event as CustomEvent).detail.error.message)
    })

    editor.insertFiles([imageFile()])
    expect(errors).toEqual(['too big'])
    expect(editor.getAttachments()).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
  })

  it('fires upload-start, upload-progress and upload-success', () => {
    const editor = makeEditor()
    const order: string[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { progress: (f: number) => void; respond: (r: UploadSuccessResult) => void }
      detail.progress(0.5)
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    for (const name of ['wryte-upload-start', 'wryte-upload-progress', 'wryte-upload-success']) {
      editor.element.addEventListener(name, () => order.push(name))
    }

    editor.insertFiles([imageFile()])
    expect(order).toEqual(['wryte-upload-start', 'wryte-upload-progress', 'wryte-upload-success'])
  })

  it('shows a progress circle while the image upload is pending and hides it on success', () => {
    const editor = makeEditor()
    let progress: ((f: number) => void) | null = null
    let respond: ((r: UploadSuccessResult) => void) | null = null
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as {
        progress: (f: number) => void
        respond: (r: UploadSuccessResult) => void
      }
      progress = detail.progress
      respond = detail.respond
    })

    editor.insertFiles([imageFile()])

    const wrapper = editor.element.querySelector<HTMLElement>('.wryte-image')
    expect(wrapper).not.toBeNull()
    const img = wrapper!.querySelector<HTMLImageElement>('img[data-wryte-attachment]')
    expect(img).not.toBeNull()
    // No broken image while pending: the src is a transparent placeholder.
    expect(img!.getAttribute('src')).toBe('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
    const overlay = wrapper!.querySelector<HTMLElement>('.wryte-progress')
    expect(overlay).not.toBeNull()
    expect(overlay!.hasAttribute('hidden')).toBe(false)
    const bar = overlay!.querySelector<SVGCircleElement>('.wryte-progress-bar')
    expect(bar).not.toBeNull()

    progress!(0.42)
    expect(bar!.style.strokeDashoffset).toBe('51.01946469429824')

    respond!({ url: 'https://cdn.example.com/photo.png' })
    expect(overlay!.hasAttribute('hidden')).toBe(true)
    expect(img!.getAttribute('src')).toBe('https://cdn.example.com/photo.png')
  })

  it('dispatches upload events that bubble to document', async () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = new Editor(element, { toolbar: false })
    const seen: number[] = []
    document.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      seen.push(detail.respond.length)
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })

    editor.insertFiles([imageFile()])
    expect(seen).toContain(1)
    element.remove()
    // Removing the editor destroys its EditorView, whose DOMObserver schedules
    // a 20ms flush timer. Let it fire inside the jsdom environment, or it races
    // the environment teardown and throws "document is not defined".
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  it('times out an unanswered upload', async () => {
    const editor = new Editor(document.createElement('div'), { toolbar: false, uploadTimeout: 10 })
    const errors: string[] = []
    editor.element.addEventListener('wryte-upload-error', (event) => {
      errors.push((event as CustomEvent).detail.error.message)
    })
    editor.insertFiles([imageFile()])
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(errors).toEqual(['upload timed out'])
    expect(editor.getAttachments()).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
  })

  it('cancels the timeout timer when the upload succeeds in time', async () => {
    const editor = new Editor(document.createElement('div'), { toolbar: false, uploadTimeout: 10 })
    const errors: string[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    editor.element.addEventListener('wryte-upload-error', (event) => {
      errors.push((event as CustomEvent).detail.error.message)
    })
    editor.insertFiles([imageFile()])
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(errors).toEqual([])
    expect(editor.toMarkdown()).toBe('![photo.png](https://cdn.example.com/photo.png)')
  })

  it('ignores a second respond() call', () => {
    const editor = makeEditor()
    let respond: ((r: UploadSuccessResult) => void) | null = null
    let successes = 0
    editor.element.addEventListener('wryte-upload-request', (event) => {
      respond = (event as CustomEvent).detail.respond
    })
    editor.element.addEventListener('wryte-upload-success', () => successes++)
    editor.insertFiles([imageFile()])
    respond!({ url: 'https://cdn.example.com/a.png' })
    respond!({ url: 'https://cdn.example.com/b.png' })
    expect(successes).toBe(1)
    expect(editor.toMarkdown()).toBe('![photo.png](https://cdn.example.com/a.png)')
  })
})
