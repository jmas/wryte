import { describe, expect, it } from 'vitest'
import { Editor } from '../src/index'
import type { UploadSuccessResult } from '../src/index'

function makeEditor(value = ''): Editor {
  return new Editor(document.createElement('div'), { value, toolbar: false })
}

function imageFile(name = 'photo.png'): File {
  return new File(['bytes'], name, { type: 'image/png' })
}

describe('lifecycle events', () => {
  it('fires wryte-before-initialize and wryte-initialize on construction', () => {
    const element = document.createElement('div')
    const order: string[] = []
    element.addEventListener('wryte-before-initialize', () => order.push('before-init'))
    element.addEventListener('wryte-initialize', () => order.push('init'))
    new Editor(element, { toolbar: false })
    expect(order).toEqual(['before-init', 'init'])
  })

  it('fires wryte-sync, wryte-render and wryte-change in order on an edit', () => {
    const editor = makeEditor('')
    const order: string[] = []
    for (const name of ['wryte-sync', 'wryte-render', 'wryte-change']) {
      editor.element.addEventListener(name, () => order.push(name))
    }
    editor.insertString('x')
    expect(order).toEqual(['wryte-sync', 'wryte-render', 'wryte-change'])
  })

  it('fires wryte-attributes-change with the new attributes', () => {
    const editor = makeEditor('Some text')
    const seen: Array<Record<string, unknown>> = []
    editor.element.addEventListener('wryte-attributes-change', (event) => {
      seen.push((event as CustomEvent).detail.attributes)
    })
    editor.setSelectedRange([0, 9])
    editor.activateAttribute('bold')
    const last = seen[seen.length - 1]
    expect(last.bold).toBe(true)
    expect(last.italic).toBe(false)
  })

  it('fires wryte-actions-change when undo availability changes', () => {
    const editor = makeEditor('')
    const seen: Array<{ undo: boolean; redo: boolean }> = []
    editor.element.addEventListener('wryte-actions-change', (event) => {
      seen.push((event as CustomEvent).detail.actions)
    })
    editor.insertString('abc')
    expect(seen[seen.length - 1].undo).toBe(true)
    editor.undo()
    expect(seen[seen.length - 1].undo).toBe(false)
    expect(seen[seen.length - 1].redo).toBe(true)
  })

  it('fires wryte-focus and wryte-blur', async () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = new Editor(element, { toolbar: false })
    const seen: string[] = []
    element.addEventListener('wryte-focus', () => seen.push('focus'))
    element.addEventListener('wryte-blur', () => seen.push('blur'))
    editor.focus()
    editor.editorView.dom.dispatchEvent(new Event('blur'))
    expect(seen).toEqual(['focus', 'blur'])
    element.remove()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  it('bubbles change events up to document', async () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = new Editor(element, { toolbar: false })
    const seen: string[] = []
    document.addEventListener('wryte-change', () => seen.push('change'))
    editor.insertString('x')
    expect(seen).toEqual(['change'])
    element.remove()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
})

describe('attachment events', () => {
  it('fires wryte-attachment-edit when an attachment changes', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/a.png' })
    })
    editor.insertFiles([imageFile()])
    const attachment = editor.getAttachments()[0]
    const edited: string[] = []
    editor.element.addEventListener('wryte-attachment-edit', (event) => {
      edited.push((event as CustomEvent).detail.attachment.id)
    })
    attachment.setAttribute('alt', 'new alt')
    expect(edited).toEqual([attachment.id])
    expect(editor.toMarkdown()).toContain('![new alt]')
  })

  it('fires wryte-attachment-remove when the node leaves the document', () => {
    const editor = makeEditor()
    editor.element.addEventListener('wryte-upload-request', (event) => {
      const detail = (event as CustomEvent).detail as { respond: (r: UploadSuccessResult) => void }
      detail.respond({ url: 'https://cdn.example.com/a.png' })
    })
    editor.insertFiles([imageFile()])
    const attachment = editor.getAttachments()[0]
    const removed: string[] = []
    editor.element.addEventListener('wryte-attachment-remove', (event) => {
      removed.push((event as CustomEvent).detail.attachment.id)
    })
    editor.clear()
    expect(removed).toEqual([attachment.id])
  })
})

describe('embed events', () => {
  it('fires wryte-embed-success when a response lands', async () => {
    const editor = makeEditor('')
    editor.element.addEventListener('wryte-embed-request', (event) => {
      const detail = (event as CustomEvent).detail as { url: string; respond: (r: { title?: string }) => void }
      detail.respond({ title: 'The site' })
    })
    const successes: string[] = []
    editor.element.addEventListener('wryte-embed-success', (event) => {
      successes.push((event as CustomEvent).detail.url)
    })
    editor.insertEmbed('https://example.com')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(successes).toEqual(['https://example.com'])
    expect(editor.toMarkdown()).toBe('https://example.com')
  })
})
