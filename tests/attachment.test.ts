import { describe, expect, it } from 'vitest'
import { Attachment } from '../src/index'
import type { AttachmentDelegate } from '../src/index'

function makeDelegate(): AttachmentDelegate & { calls: { change: number; removal: number } } {
  const calls = { change: 0, removal: 0 }
  return {
    calls,
    attachmentDidChangeAttributes: () => {
      calls.change++
    },
    attachmentDidRequestRemoval: () => {
      calls.removal++
    },
  }
}

describe('Attachment', () => {
  it('builds from a file', () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const attachment = Attachment.attachmentForFile(file)
    expect(attachment.id).toBeTruthy()
    expect(attachment.getFilename()).toBe('photo.png')
    expect(attachment.getFilesize()).toBe(1)
    expect(attachment.getContentType()).toBe('image/png')
    expect(attachment.getFile()).toBe(file)
    expect(attachment.isPending()).toBe(true)
  })

  it('copies only the known attributes from node attrs', () => {
    const attachment = Attachment.fromNodeAttributes({ url: 'u', filename: 'f' } as never)
    expect(attachment.getAttributes()).toEqual(expect.objectContaining({ url: 'u', filename: 'f' }))
    expect('id' in attachment.getAttributes()).toBe(true)
  })

  it('is pending only while a file is set and no url or href exists', () => {
    const attachment = new Attachment({})
    expect(attachment.isPending()).toBe(false)
    attachment.setFile(new File(['x'], 'a.txt'))
    expect(attachment.isPending()).toBe(true)
    attachment.setAttribute('url', 'u')
    expect(attachment.isPending()).toBe(false)
  })

  it('classifies by content type', () => {
    const img = new Attachment({ contentType: 'image/png' })
    expect(img.isPreviewable()).toBe(true)
    expect(img.getType()).toBe('preview')
    const gif = new Attachment({ contentType: 'image/gif' })
    expect(gif.isPreviewable()).toBe(true)
    expect(gif.getType()).toBe('preview')
    const jpg = new Attachment({ contentType: 'image/jpeg' })
    expect(jpg.isPreviewable()).toBe(true)
    expect(new Attachment({ contentType: 'image/*' }).isPreviewable()).toBe(true)
    const pdf = new Attachment({ contentType: 'application/pdf' })
    expect(pdf.isPreviewable()).toBe(false)
    expect(pdf.getType()).toBe('file')
    expect(new Attachment({ contentType: 'image/png' }).getType()).toBe('preview')
  })

  it('never reports content type content (not implemented)', () => {
    expect(new Attachment({}).getType()).toBe('file')
  })

  it('notifies the delegate only when attributes actually change', () => {
    const delegate = makeDelegate()
    const attachment = new Attachment({ url: 'u' })
    attachment.setDelegate(delegate)
    attachment.setAttribute('url', 'u2')
    expect(delegate.calls.change).toBe(1)
    attachment.setAttribute('url', 'u2')
    expect(delegate.calls.change).toBe(1)
    attachment.setAttributes({ alt: 'a', width: 1 })
    expect(delegate.calls.change).toBe(2)
  })

  it('merges attributes and keeps the id pinned', () => {
    const attachment = new Attachment({ id: 'fixed', url: null })
    attachment.setAttributes({ url: 'u', alt: 'a' } as never)
    expect(attachment.id).toBe('fixed')
    expect(attachment.getURL()).toBe('u')
    expect(attachment.getAttribute('alt')).toBe('a')
  })

  it('extracts the extension from the filename', () => {
    expect(new Attachment({ filename: 'photo.JPG' }).getExtension()).toBe('jpg')
    expect(new Attachment({ filename: 'archive.tar.gz' }).getExtension()).toBe('gz')
    expect(new Attachment({ filename: 'noext' }).getExtension()).toBe('')
  })

  it('syncs from a node without resetting the id', () => {
    const attachment = new Attachment({ id: 'fixed', url: null })
    attachment.syncFromNode({ id: 'other', url: 'u' } as never)
    expect(attachment.id).toBe('fixed')
    expect(attachment.getURL()).toBe('u')
  })

  it('requests removal through the delegate', () => {
    const delegate = makeDelegate()
    const attachment = new Attachment({})
    attachment.setDelegate(delegate)
    attachment.remove()
    expect(delegate.calls.removal).toBe(1)
  })

  it('serializes to attributes via toJSON', () => {
    const attachment = new Attachment({ url: 'u', alt: 'a' })
    expect(attachment.toJSON()).toEqual(expect.objectContaining({ url: 'u', alt: 'a', id: attachment.id }))
    expect(attachment.getAttributes()).toEqual(attachment.toJSON())
  })
})
