import { isPreviewable, isVideo } from './schema'
import type { AttachmentAttrs } from './schema'

let nextId = 1

export interface AttachmentDelegate {
  attachmentDidChangeAttributes(attachment: Attachment): void
  attachmentDidRequestRemoval(attachment: Attachment): void
}

const ATTRIBUTE_KEYS: (keyof AttachmentAttrs)[] = [
  'id',
  'url',
  'href',
  'alt',
  'filename',
  'filesize',
  'contentType',
  'width',
  'height',
  'presentation',
  'poster',
]

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `wryte-attachment-${nextId++}`
}

export class Attachment {
  readonly id: string
  attributes: AttachmentAttrs
  file: File | null = null
  uploadProgress = 0
  private delegate: AttachmentDelegate | null = null

  static attachmentForFile(file: File): Attachment {
    const attachment = new Attachment({
      id: generateId(),
      filename: file.name,
      filesize: file.size,
      contentType: file.type || null,
      url: null,
      href: null,
      alt: null,
      width: null,
      height: null,
      presentation: null,
      poster: null,
    })
    attachment.setFile(file)
    return attachment
  }

  static fromNodeAttributes(attrs: AttachmentAttrs): Attachment {
    const cleaned: Record<string, unknown> = {}
    for (const key of ATTRIBUTE_KEYS) cleaned[key] = attrs[key]
    return new Attachment(cleaned as Partial<AttachmentAttrs>)
  }

  constructor(attributes: Partial<AttachmentAttrs> = {}) {
    this.attributes = { ...DEFAULT_ATTRIBUTES, ...attributes }
    this.id = this.attributes.id ?? generateId()
    this.attributes.id = this.id
  }

  setDelegate(delegate: AttachmentDelegate | null): void {
    this.delegate = delegate
  }

  getAttribute(name: keyof AttachmentAttrs): unknown {
    return this.attributes[name]
  }

  setAttribute(name: keyof AttachmentAttrs, value: unknown): void {
    this.setAttributes({ [name]: value })
  }

  getAttributes(): AttachmentAttrs {
    return { ...this.attributes }
  }

  setAttributes(attributes: Partial<AttachmentAttrs>): void {
    const merged: AttachmentAttrs = { ...this.attributes, ...attributes, id: this.id }
    if (JSON.stringify(merged) === JSON.stringify(this.attributes)) return
    this.attributes = merged
    this.delegate?.attachmentDidChangeAttributes(this)
  }

  syncFromNode(attributes: AttachmentAttrs): void {
    this.attributes = { ...this.attributes, ...attributes, id: this.id }
  }

  isPending(): boolean {
    return this.file != null && !(this.getURL() || this.getHref())
  }

  isPreviewable(): boolean {
    return isPreviewable(this.getContentType())
  }

  isVideo(): boolean {
    return isVideo(this.getContentType())
  }

  getType(): 'content' | 'preview' | 'file' {
    if (this.hasContent()) return 'content'
    if (this.isPreviewable()) return 'preview'
    return 'file'
  }

  getURL(): string | null {
    return this.attributes.url
  }

  getHref(): string | null {
    return this.attributes.href
  }

  getFilename(): string {
    return this.attributes.filename || ''
  }

  getFilesize(): number | null {
    return this.attributes.filesize
  }

  getExtension(): string {
    return this.getFilename().match(/\.(\w+)$/)?.[1]?.toLowerCase() ?? ''
  }

  getContentType(): string | null {
    return this.attributes.contentType
  }

  getFile(): File | null {
    return this.file
  }

  setFile(file: File | null): void {
    this.file = file
  }

  getUploadProgress(): number {
    return this.uploadProgress
  }

  setUploadProgress(value: number): void {
    this.uploadProgress = value
  }

  hasContent(): boolean {
    return false
  }

  toJSON(): AttachmentAttrs {
    return this.getAttributes()
  }

  remove(): void {
    this.delegate?.attachmentDidRequestRemoval(this)
  }
}

const DEFAULT_ATTRIBUTES: AttachmentAttrs = {
  id: null,
  url: null,
  href: null,
  alt: null,
  filename: '',
  filesize: null,
  contentType: null,
  width: null,
  height: null,
  presentation: null,
  poster: null,
}
