export const EventName = {
  beforeInitialize: 'wryte-before-initialize',
  initialize: 'wryte-initialize',
  change: 'wryte-change',
  render: 'wryte-render',
  sync: 'wryte-sync',
  selectionChange: 'wryte-selection-change',
  attributesChange: 'wryte-attributes-change',
  actionsChange: 'wryte-actions-change',
  focus: 'wryte-focus',
  blur: 'wryte-blur',
  beforePaste: 'wryte-before-paste',
  paste: 'wryte-paste',
  attachmentAdd: 'wryte-attachment-add',
  attachmentEdit: 'wryte-attachment-edit',
  attachmentRemove: 'wryte-attachment-remove',
  fileAccept: 'wryte-file-accept',
  fileReject: 'wryte-file-reject',
  embedRequest: 'wryte-embed-request',
  embedSuccess: 'wryte-embed-success',
  uploadRequest: 'wryte-upload-request',
  uploadStart: 'wryte-upload-start',
  uploadProgress: 'wryte-upload-progress',
  uploadSuccess: 'wryte-upload-success',
  uploadError: 'wryte-upload-error',
  actionInvoke: 'wryte-action-invoke',
  toolbarDialogShow: 'wryte-toolbar-dialog-show',
  toolbarDialogHide: 'wryte-toolbar-dialog-hide',
} as const

export type WryteEventName = (typeof EventName)[keyof typeof EventName]

export interface WryteEventOptions {
  cancelable?: boolean
}

export function dispatchWryteEvent<T extends object>(
  element: HTMLElement,
  name: WryteEventName,
  detail: T,
  options: WryteEventOptions = {},
): CustomEvent<T> {
  const { cancelable = true } = options
  const event = new CustomEvent<T>(name, { bubbles: true, cancelable, detail })
  element.dispatchEvent(event)
  return event
}
