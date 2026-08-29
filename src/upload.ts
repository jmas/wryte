import { EventName, dispatchWryteEvent } from './events'
import type { Attachment } from './attachment'
import type { Editor } from './editor'

export interface UploadErrorResult {
  error: { message: string }
}

export interface UploadSuccessResult {
  url: string
  href?: string | null
  alt?: string | null
  filename?: string
  filesize?: number | null
  width?: number | null
  height?: number | null
  presentation?: string | null
  [key: string]: unknown
}

export type UploadResult = UploadSuccessResult | UploadErrorResult

export interface UploadRequestDetail {
  editor: Editor
  file: File
  attachment: Attachment
  respond(result: UploadResult): void
  progress(fraction: number): void
}

// Drives the file-upload lifecycle through bubbling DOM events. The editor
// never uploads anything itself: a listener catches `wryte-upload-request`
// (from the editor element or anywhere up the tree, e.g. `document`), performs
// validation and the upload, then calls `respond()` / `progress()`.
export class UploadManager {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private editor: Editor) {}

  requestUpload(attachment: Attachment): void {
    const file = attachment.getFile()
    if (!file || !attachment.isPending()) return
    if (this.timers.has(attachment.id)) return

    const { element, options } = this.editor
    let responded = false

    dispatchWryteEvent(element, EventName.uploadStart, { editor: this.editor, attachment, file })

    const respond = (result: UploadResult): void => {
      if (responded) return
      responded = true
      this.clearTimer(attachment)
      if ('error' in result && result.error) {
        const message = (result.error as { message?: string }).message ?? 'upload failed'
        this.editor.failUpload(attachment, message)
      } else {
        this.editor.succeedUpload(attachment, result as UploadSuccessResult)
      }
    }

    const progress = (fraction: number): void => {
      attachment.setUploadProgress(fraction)
      this.editor.updateAttachmentProgress(attachment, fraction)
      dispatchWryteEvent(element, EventName.uploadProgress, {
        editor: this.editor,
        attachment,
        file,
        progress: fraction,
      })
    }

    const detail: UploadRequestDetail = { editor: this.editor, file, attachment, respond, progress }
    dispatchWryteEvent(element, EventName.uploadRequest, detail)

    const timeout = options.uploadTimeout
    if (timeout != null && timeout > 0) {
      const timer = setTimeout(() => {
        if (!responded) respond({ error: { message: 'upload timed out' } })
      }, timeout)
      this.timers.set(attachment.id, timer)
    }
  }

  clearTimer(attachment: Attachment): void {
    const timer = this.timers.get(attachment.id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(attachment.id)
    }
  }
}
