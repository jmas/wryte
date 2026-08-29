import './src/index'
import type { Editor } from './src/index'

const element = document.querySelector<HTMLElement & { editor: Editor | null }>('#e')
if (!element) throw new Error('missing #e')

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

window.addEventListener('error', (e) => log('WINDOW ERROR:', e.message))
window.addEventListener('unhandledrejection', (e) => log('UNHANDLED REJECTION:', e.reason))

for (const name of ['wryte-focus', 'wryte-selection-change', 'wryte-blur', 'wryte-change']) {
  element.addEventListener(name, (e) => log('EVENT', (e as CustomEvent).type))
}

const btn = (): HTMLButtonElement | null => element.querySelector<HTMLButtonElement>('.wryte-plus-button')

function report(tag: string): void {
  const b = btn()
  const view = element.editor!.editorView
  let coords: { top: number; bottom: number; left: number; right: number } | null = null
  try {
    coords = view.coordsAtPos(view.state.selection.from)
  } catch (e) {
    coords = null
    log('coordsAtPos threw', e)
  }
  const er = element.getBoundingClientRect()
  const pr = view.dom.getBoundingClientRect()
  log('--- report ' + tag + ' ---')
  log('selection.from:', view.state.selection.from, 'empty:', view.state.selection.empty)
  log('coordsAtPos:', coords ? JSON.stringify({ top: coords.top, bottom: coords.bottom, left: coords.left, right: coords.right }) : 'null')
  log('editorRect:', JSON.stringify({ top: er.top, bottom: er.bottom, height: er.height }))
  log('pmRect:', JSON.stringify({ top: pr.top, bottom: pr.bottom, height: pr.height, paddingTop: getComputedStyle(view.dom).paddingTop }))
  if (b) {
    const br = b.getBoundingClientRect()
    log('plusButton:', JSON.stringify({ top: br.top, bottom: br.bottom, height: br.height, left: br.left, right: br.right, display: getComputedStyle(b).display }))
    log('plusButton style:', JSON.stringify({ top: b.style.top, right: b.style.right, transform: b.style.transform }))
  } else {
    log('plusButton: NOT IN DOM')
  }
  log('activeElement:', (document.activeElement as HTMLElement | null)?.tagName, document.activeElement?.className)
}

log('customElements.get:', customElements.get('wryte-editor')?.name)
log('has editor after load?', element.editor != null)
if (!element.editor) {
  await new Promise((resolve) => setTimeout(resolve, 100))
}
const editor = element.editor!
if (editor == null) throw new Error('editor never became available')

report('initial (after autofocus)')

log('--- native focus log ---')
log((window as unknown as { __nativeFocusLog?: string[] }).__nativeFocusLog?.join('\n') ?? '(none)')

log('--- __cmDebug ---')
log((window as unknown as { __cmDebug?: string[] }).__cmDebug?.join('\n') ?? '(none)')

setTimeout(() => report('after 500ms'), 500)
setTimeout(() => {
  log('--- manually dispatch wryte-focus ---')
  element.dispatchEvent(new CustomEvent('wryte-focus', { bubbles: true }))
  log('cmDebug:', (window as unknown as { __cmDebug?: string[] }).__cmDebug?.join(' | ') ?? '(none)')
  report('after manual wryte-focus')
}, 900)
