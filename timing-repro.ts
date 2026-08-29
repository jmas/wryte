import './src/index'
import type { Editor } from './src/index'

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

const el = document.createElement('wryte-editor')
el.className = 'editor'
el.setAttribute('value', '## Hello\n\nSome **bold** text here.\n\nLast paragraph with content.')
document.body.appendChild(el)
await new Promise((resolve) => setTimeout(resolve, 0))
const editor = el.editor!
const view = editor.editorView

function coords(tag: string): void {
  let c: { top: number; bottom: number } | null = null
  try {
    c = view.coordsAtPos(view.state.selection.from)
  } catch (e) {
    c = null
  }
  const er = el.getBoundingClientRect()
  log(`${tag}: sel.from=${view.state.selection.from} coords=${c ? JSON.stringify({ top: c.top, bottom: c.bottom }) : 'threw'} editorRect.top=${er.top} relTop=${c ? (c.top + (c.bottom - c.top) / 2 - er.top).toFixed(1) : '-'}`)
}

log('--- set selection to end, split (like demo) ---')
const md = editor.toMarkdown()
editor.setSelectedRange([md.length, md.length])
coords('after setSelectedRange')
editor.insertLineBreak()
coords('sync, right after insertLineBreak')
setTimeout(() => coords('after 100ms'), 100)
setTimeout(() => coords('after 600ms'), 600)
