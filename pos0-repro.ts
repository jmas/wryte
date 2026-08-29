import './src/index'
import type { Editor } from './src/index'

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

const el = document.createElement('wryte-editor')
el.className = 'editor'
document.body.appendChild(el)
await new Promise((resolve) => setTimeout(resolve, 0))
const editor = el.editor!
const view = editor.editorView

function coordsAt(pos: number): string {
  try {
    const c = view.coordsAtPos(pos)
    return `${pos}: ${JSON.stringify({ top: c.top, bottom: c.bottom, left: c.left, right: c.right })}`
  } catch (e) {
    return `${pos}: threw ${(e as Error).message}`
  }
}

log('--- empty doc ---')
log('size:', view.state.doc.content.size)
log('selection.from:', view.state.selection.from)
log(coordsAt(0))
log(coordsAt(1))

// Try forcing selection to position 0.
editor.setSelectedRange([0, 0])
log('after setSelectedRange([0,0]) selection.from:', view.state.selection.from)
log('selection type:', view.state.selection.constructor.name)
log(coordsAt(view.state.selection.from))
