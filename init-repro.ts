import './src/index'
import type { Editor } from './src/index'

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

const el = document.createElement('wryte-editor')
el.className = 'editor'
document.body.appendChild(el)

const editor = el.editor!
const view = editor.editorView

// Simulate autofocus: view.focus() sets document.activeElement to the editor
// DOM and fires the focus event synchronously during the Editor constructor —
// same task as the element upgrade, before any layout pass.
editor.focus()
el.dispatchEvent(new CustomEvent('wryte-focus', { bubbles: true }))

log('rAF fired test…')
let rafCount = 0
function tick(): void {
  rafCount++
  if (rafCount < 3) requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
setTimeout(() => log('rAF fired:', rafCount, 'times'), 200)

const btn = el.querySelector<HTMLButtonElement>('.wryte-plus-button')
log('SAME TASK (no layout):')
log('  plusButton in DOM:', !!btn)
if (btn) {
  log('  plus top style:', btn.style.top)
  const er = el.getBoundingClientRect()
  log('  editorRect.top:', er.top, 'plus rect top:', btn.getBoundingClientRect().top)
}
let c: { top: number; bottom: number } | null = null
try {
  c = view.coordsAtPos(view.state.selection.from)
} catch {
  c = null
}
log('  coordsAtPos(1):', c ? JSON.stringify(c) : 'threw')

setTimeout(() => {
  const b = el.querySelector<HTMLButtonElement>('.wryte-plus-button')
  const er = el.getBoundingClientRect()
  log('AFTER TIMEOUT:')
  log('  plus top style:', b?.style.top)
  if (b) log('  editorRect.top:', er.top, 'plus rect top:', b.getBoundingClientRect().top)
  let c2: { top: number; bottom: number } | null = null
  try {
    c2 = view.coordsAtPos(view.state.selection.from)
  } catch {
    c2 = null
  }
  log('  coordsAtPos(1):', c2 ? JSON.stringify(c2) : 'threw')
  if (c2 && b) {
    const expectedTop = c2.top + (c2.bottom - c2.top) / 2 - er.top - 1
    log('  expected plus top (caret center - editor top - border):', expectedTop.toFixed(2))
    log('  MISALIGNED by:', (parseFloat(b.style.top) - expectedTop).toFixed(2), 'px')
  }
}, 100)
