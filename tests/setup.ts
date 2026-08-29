import { afterEach } from 'vitest'
import { destroyAllLiveEditors } from '../src/editor'

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
