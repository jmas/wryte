import './src/index'
import type { Editor } from './src/index'

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

const content = [
  '## Hello wryte',
  '',
  'This editor is **tag-first**: markdown is the source of truth.',
  '',
  '- [x] typing and formatting work',
  '',
  'https://example.com',
  '',
  '```ts',
  'const editor = document.querySelector("wryte-editor").editor',
  '```',
].join('\n')

const el = document.createElement('wryte-editor')
el.className = 'editor prose'
el.setAttribute('value', content)
document.body.appendChild(el)
await new Promise((resolve) => setTimeout(resolve, 0))
const editor = el.editor!
const view = editor.editorView

// Replicate demo/main.ts
const end = editor.toMarkdown().length
editor.setSelectedRange([end, end])
editor.insertLineBreak()

function snap(label: string): void {
  let c: { top: number; bottom: number } | null = null
  try {
    c = view.coordsAtPos(view.state.selection.from)
  } catch (e) {
    c = null
  }
  const er = el.getBoundingClientRect()
  const b = el.querySelector<HTMLButtonElement>('.wryte-plus-button')
  const lastChild = view.dom.lastElementChild
  log(`${label}: sel.from=${view.state.selection.from}`)
  log(`  lastChild: ${lastChild?.tagName} ${lastChild?.textContent ? JSON.stringify(lastChild.textContent) : ''} rect=${lastChild ? JSON.stringify(lastChild.getBoundingClientRect().toJSON?.() ?? { top: lastChild.getBoundingClientRect().top, bottom: lastChild.getBoundingClientRect().bottom }) : 'n/a'}`)
  log(`  coords=${c ? JSON.stringify({ top: c.top, bottom: c.bottom }) : 'null'} editorRect.top=${er.top} lineCenterRel=${c ? ((c.top + (c.bottom - c.top) / 2) - er.top - 1).toFixed(1) : '-'}`)
  if (b) log(`  plus: top=${b.style.top} centerRel=${(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2 - er.top).toFixed(1)}`)
  else log(`  plus: NOT IN DOM`)
}

snap('after split')

// view.focus() sets document.activeElement to the editor DOM in a real
// browser (and even in this panel); the focus event then fires synchronously
// and dispatches wryte-focus. Simulate the event here.
editor.focus()
log('activeElement:', (document.activeElement as HTMLElement)?.className)
el.dispatchEvent(new CustomEvent('wryte-focus', { bubbles: true }))
snap('after wryte-focus')

setTimeout(() => snap('after 150ms'), 150)
setTimeout(() => snap('after 700ms'), 700)
