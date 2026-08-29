import './src/index'
import type { Editor } from './src/index'

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}

async function freshEditor(tag: string): Promise<void> {
  const el = document.createElement('wryte-editor')
  el.className = 'editor'
  el.setAttribute('placeholder', 'Type here…')
  document.body.appendChild(el)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const editor = el.editor!
  const view = editor.editorView

  const btn = (): HTMLButtonElement | null => el.querySelector<HTMLButtonElement>('.wryte-plus-button')

  function coordsAt(pos: number): string {
    try {
      const c = view.coordsAtPos(pos)
      return `${pos}: ${JSON.stringify({ top: c.top, bottom: c.bottom, left: c.left, right: c.right })}`
    } catch (e) {
      return `${pos}: threw ${e}`
    }
  }

  function snap(label: string): void {
    const er = el.getBoundingClientRect()
    const b = btn()
    log(`[${tag}] ${label}: editorRect.top=${er.top}`)
    log(`[${tag}] coordsAt: ${coordsAt(0)} | ${coordsAt(1)}`)
    if (b) log(`[${tag}] plus: top=${b.style.top} rect.top=${b.getBoundingClientRect().top}`)
  }

  // Simulate the constructor-time focus: wryte-focus fires synchronously in
  // the same task the editor was just created (a real browser fires the focus
  // event when autofocus calls view.focus()).
  el.dispatchEvent(new CustomEvent('wryte-focus', { bubbles: true }))
  snap('immediately after wryte-focus')

  setTimeout(() => {
    snap('after 100ms')
    setTimeout(() => snap('after 600ms'), 500)
  }, 100)
}

log('=== fresh editor 1 ===')
await freshEditor('E1')
