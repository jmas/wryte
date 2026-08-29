export { Editor, config } from './editor.js'
export type { EditorConfig, EditorOptions, EditorSelection, EditorSnapshot } from './editor.js'
export type { Ability } from './editor.js'
export { ALL_ABILITIES } from './editor.js'
export { registerElement, registerEditorElement, registerToolbarElement } from './elements.js'
export { Attachment } from './attachment.js'
export type { AttachmentDelegate } from './attachment.js'
export { schema } from './schema.js'
export type { AttachmentAttrs } from './schema.js'
export { markdownParser, markdownSerializer } from './markdown.js'
export { ContextMenuController } from './contextmenu.js'
export { EventName } from './events.js'
export type { WryteEventName } from './events.js'
export { URL_RE, extractHost, normalizeUrl, EmbedManager } from './embed.js'
export type { EmbedAttrs, EmbedRequestDetail, EmbedResult } from './embed.js'
export { ImageManager } from './image.js'
export type { ImageErrorResult, ImageRequestDetail, ImageRequestResult, ImageResult } from './image.js'
export type {
  UploadErrorResult,
  UploadRequestDetail,
  UploadResult,
  UploadSuccessResult,
} from './upload.js'
export { fileTypeMatches, acceptAttribute } from './upload.js'

import { Editor, config } from './editor.js'
import { registerElement } from './elements.js'
import { Attachment } from './attachment.js'

export const Wryte = {
  Editor,
  config,
  registerElement,
  Attachment,
}
