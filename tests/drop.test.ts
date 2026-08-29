import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'
import type { UploadSuccessResult } from '../src/index'

function makeEditor(value = ''): Editor {
  return new Editor(document.createElement('div'), { value, toolbar: false })
}

function imageFile(name = 'photo.png'): File {
  return new File(['bytes'], name, { type: 'image/png' })
}

function pdfFile(name = 'report.pdf'): File {
  return new File(['bytes'], name, { type: 'application/pdf' })
}

// jsdom has no DataTransfer-backed DragEvent, so stub the transfer the way the
// editor's drop handler reads it.
function drop(editor: Editor, files: File[]): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as unknown as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, getData: () => '' },
  })
  Object.defineProperty(event, 'clientX', { value: 10 })
  Object.defineProperty(event, 'clientY', { value: 10 })
  editor.editorView.dom.dispatchEvent(event)
  return event
}

// Same stub for the paste handler's clipboardData.
function paste(editor: Editor, files: File[]): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      getData: (type: string) => (type === 'text/plain' ? '' : ''),
    },
  })
  editor.editorView.dom.dispatchEvent(event)
  return event
}

describe('file drop', () => {
  it('inserts a dropped image and runs the familiar upload flow', () => {
    const editor = makeEditor()
    const requested: Array<{ file: File; respond: (r: UploadSuccessResult) => void }> = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as {
        file: File
        respond: (r: UploadSuccessResult) => void
      }
      requested.push(detail)
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    const drops: number[] = []
    editor.element.addEventListener('wryte-drop', () => drops.push(1))

    drop(editor, [imageFile()])

    expect(requested).toHaveLength(1)
    expect(requested[0].file.name).toBe('photo.png')
    expect(editor.getAttachments()).toHaveLength(1)
    expect(editor.toMarkdown()).toBe('![photo.png](https://cdn.example.com/photo.png)')
    expect(drops).toHaveLength(1)
  })

  it('inserts multiple dropped files', () => {
    const editor = makeEditor()
    const requested: File[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { file: File; respond: (r: UploadSuccessResult) => void }
      requested.push(detail.file)
      detail.respond({ url: 'https://cdn.example.com/' + detail.file.name })
    })

    drop(editor, [imageFile('a.png'), imageFile('b.png')])

    expect(requested.map((f) => f.name)).toEqual(['a.png', 'b.png'])
    expect(editor.getAttachments()).toHaveLength(2)
    expect(editor.toMarkdown()).toBe(
      '![a.png](https://cdn.example.com/a.png)\n\n![b.png](https://cdn.example.com/b.png)',
    )
  })

  it('inserts non-previewable files as inline attachments', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/report.pdf' })
    })

    drop(editor, [pdfFile()])

    expect(editor.toMarkdown()).toBe('[report.pdf](https://cdn.example.com/report.pdf)')
  })

  it('inserts at the drop position, not the current selection', () => {
    const editor = makeEditor('onetwo')
    // A selection elsewhere that would be used without a layout-backed drop pos.
    editor.setSelectedRange([0, 0])
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    // jsdom has no layout, so pin the drop point explicitly.
    editor.editorView.posAtCoords = () => ({ pos: 4, inside: -1 })

    drop(editor, [imageFile()])

    expect(editor.toMarkdown()).toBe('one\n\n![photo.png](https://cdn.example.com/photo.png)\n\ntwo')
  })

  it('falls back to the current selection when layout is unavailable', () => {
    const editor = makeEditor('one two')
    editor.setSelectedRange([0, 0])
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })

    drop(editor, [imageFile()])

    expect(editor.toMarkdown()).toBe('![photo.png](https://cdn.example.com/photo.png)\n\none two')
  })

  it('cancels the drop when wryte-before-drop is prevented', () => {
    const editor = makeEditor()
    const requests: number[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      requests.push(1)
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    editor.element.addEventListener('wryte-before-drop', (event) => event.preventDefault())
    const dropped: number[] = []
    editor.element.addEventListener('wryte-drop', () => dropped.push(1))

    const event = drop(editor, [imageFile()])

    expect(event.defaultPrevented).toBe(true)
    expect(requests).toHaveLength(0)
    expect(dropped).toHaveLength(0)
    expect(editor.getAttachments()).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
  })

  it('does not handle drops without files', () => {
    const editor = makeEditor()
    const requests: number[] = []
    editor.element.addEventListener('wryte-upload-request', () => requests.push(1))
    const dropped: number[] = []
    editor.element.addEventListener('wryte-drop', () => dropped.push(1))
    // jsdom's posAtCoords throws; a null drop point makes PM's default drop
    // handler exit cleanly so we can observe that our handler passed through.
    editor.editorView.posAtCoords = () => null

    const event = drop(editor, [])

    expect(event.defaultPrevented).toBe(false)
    expect(requests).toHaveLength(0)
    expect(dropped).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
  })
})

describe('file paste', () => {
  it('pastes a copied image file and runs the familiar upload flow', () => {
    const editor = makeEditor()
    const requested: Array<{ file: File; respond: (r: UploadSuccessResult) => void }> = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as {
        file: File
        respond: (r: UploadSuccessResult) => void
      }
      requested.push(detail)
      detail.respond({ url: 'https://cdn.example.com/photo.png' })
    })
    const pastes: number[] = []
    editor.element.addEventListener('wryte-paste', () => pastes.push(1))

    const event = paste(editor, [imageFile()])

    expect(event.defaultPrevented).toBe(true)
    expect(requested).toHaveLength(1)
    expect(requested[0].file.name).toBe('photo.png')
    expect(editor.getAttachments()).toHaveLength(1)
    expect(editor.toMarkdown()).toBe('![photo.png](https://cdn.example.com/photo.png)')
    expect(pastes).toHaveLength(1)
  })

  it('pastes multiple files', () => {
    const editor = makeEditor()
    const requested: string[] = []
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { file: File; respond: (r: UploadSuccessResult) => void }
      requested.push(detail.file.name)
      detail.respond({ url: 'https://cdn.example.com/' + detail.file.name })
    })

    paste(editor, [imageFile('a.png'), imageFile('b.png')])

    expect(requested).toEqual(['a.png', 'b.png'])
    expect(editor.toMarkdown()).toBe(
      '![a.png](https://cdn.example.com/a.png)\n\n![b.png](https://cdn.example.com/b.png)',
    )
  })

  it('pastes non-previewable files as inline attachments', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/report.pdf' })
    })

    paste(editor, [pdfFile()])

    expect(editor.toMarkdown()).toBe('[report.pdf](https://cdn.example.com/report.pdf)')
  })

  it('cancels the file paste when wryte-before-paste is prevented', () => {
    const editor = makeEditor()
    const requests: number[] = []
    editor.element.addEventListener('wryte-upload-request', () => requests.push(1))
    editor.element.addEventListener('wryte-before-paste', (event) => event.preventDefault())

    const event = paste(editor, [imageFile()])

    expect(event.defaultPrevented).toBe(true)
    expect(requests).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
  })

  it('leaves pastes without files as text', () => {
    const editor = makeEditor()
    const requests: number[] = []
    editor.element.addEventListener('wryte-upload-request', () => requests.push(1))

    paste(editor, [])

    expect(requests).toHaveLength(0)
    expect(editor.toMarkdown()).toBe('')
  })
})
