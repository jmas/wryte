import { afterEach } from 'vitest'
import { destroyAllLiveEditors } from '../src/editor'

// jsdom has no layout, so Range/Text nodes lack `getClientRects` /
// `getBoundingClientRect`. ProseMirror's `coordsAtPos` (reached from
// `scrollToSelection` when a focused view dispatches a `scrollIntoView()`
// transaction) calls them and would throw. Provide stub rects so those paths
// return empty geometry instead of crashing.
const zeroRect = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => zeroRect as unknown as DOMRect
}
const textNodeProto = Text.prototype as unknown as {
  getClientRects?: () => DOMRectList
  getBoundingClientRect?: () => DOMRect
}
if (!textNodeProto.getClientRects) {
  textNodeProto.getClientRects = () => [] as unknown as DOMRectList
}
if (!textNodeProto.getBoundingClientRect) {
  textNodeProto.getBoundingClientRect = () => zeroRect as unknown as DOMRect
}

const originalWarn = console.warn
console.warn = (message: unknown, ...args: unknown[]): void => {
  if (
    typeof message === 'string' &&
    message.startsWith('TextSelection endpoint not pointing into a node with inline content')
  ) {
    return
  }
  originalWarn(message, ...args)
}

// Disposes every editor created in the current test. ProseMirror's DOMObserver
// schedules 20ms flush timers while its DOM mutates; if a file ends with one
// still pending, it fires after the jsdom environment is torn down and throws
// "document is not defined". Destroying the EditorView stops the observer (its
// post-destroy flush bails on the nulled docView), so the teardown is clean.
afterEach(() => {
  destroyAllLiveEditors()
})
