import './src/index'
import type { Editor } from './src/index'

const element = document.querySelector<HTMLElement & { editor: Editor | null }>('#e')
if (!element) throw new Error('missing #e')

const info = document.querySelector<HTMLElement>('#info')!
function log(...args: unknown[]): void {
  info.textContent += args.join(' ') + '\n'
}
if (!element.editor) {
  await new Promise((resolve) => setTimeout(resolve, 100))
}
const editor = element.editor!
const view = editor.editorView

window.__nativeFocusLog = []
document.addEventListener('focus', (e) => {
  window.__nativeFocusLog.push('focus on ' + ((e.target && (e.target.className || e.target.tagName)) || '?'))
}, true)
document.addEventListener('blur', (e) => {
  window.__nativeFocusLog.push('blur on ' + ((e.target && (e.target.className || e.target.tagName)) || '?'))
}, true)

element.addEventListener('wryte-focus', () => log('EVENT wryte-focus'))
element.addEventListener('wryte-blur', () => log('EVENT wryte-blur'))
element.addEventListener('wryte-selection-change', () => log('EVENT wryte-selection-change'))

function report(tag: string): void {
  const b = element.querySelector<HTMLButtonElement>('.wryte-plus-button')
  log('--- ' + tag + ' ---')
  log('hasFocus:', view.hasFocus(), 'activeElement:', (document.activeElement as HTMLElement)?.className)
  log('plusButton:', b ? getComputedStyle(b).display + ' top=' + b.style.top : 'NOT IN DOM')
  log('native focus log:', window.__nativeFocusLog.join(', ') || '(none)')
}

const button = document.createElement('button')
button.textContent = 'call editor.focus()'
button.id = 'go'
document.body.appendChild(button)
button.addEventListener('click', () => {
  log('>>> click: editor.focus()')
  editor.focus()
  report('after editor.focus()')
})

report('initial')
