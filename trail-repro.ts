import './src/index'
import type { Editor } from './src/index'

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

const el = document.createElement('wryte-editor')
el.className = 'editor'
el.setAttribute('value', 'first paragraph\n\nsecond here\n\n')
document.body.appendChild(el)
await new Promise((resolve) => setTimeout(resolve, 0))
const editor = el.editor!
const view = editor.editorView
const doc = view.state.doc

function coordsAt(pos: number): string {
  try {
    const c = view.coordsAtPos(pos)
    return `${pos}: ${JSON.stringify({ top: c.top, bottom: c.bottom, left: c.left, right: c.right })}`
  } catch (e) {
    return `${pos}: threw ${(e as Error).message}`
  }
}

log('--- doc structure ---')
doc.descendants((node, pos) => {
  log(`block @${pos}: ${node.type.name} text=${JSON.stringify(node.textContent)} childCount=${node.childCount}`)
  return false
})
log('doc.content.size =', doc.content.size)

log('--- coordsAtPos for the trailing empty paragraph ---')
log(coordsAt(10))
log(coordsAt(11))
log(coordsAt(12))
log(coordsAt(13))

log('--- selection at the start of the trailing empty paragraph ---')
const startOfEmpty = 12
editor.setSelectedRange([startOfEmpty, startOfEmpty])
log('selection.from =', view.state.selection.from)
log(coordsAt(view.state.selection.from))
